/**
 * 打印路由 - 排版 + PDF 导出
 */
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { router, protectedProcedure } from '../instance.js';
import { LayoutInputSchema, DensityEnum } from '@kaotu/shared';
import type { LayoutInput } from '@kaotu/shared';
import { layout } from '@kaotu/shared/print';
import { cardSets, cards } from '../../db/schema.js';
import { getKVStore } from '../../infra/kvstore.js';
import { env } from '../../config/env.js';
import { renderCardText } from '../../print/render.js';

function dayPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const printRouter = router({
  /** 排版计算 */
  layout: protectedProcedure
    .input(async (raw: unknown) => {
      const z = await import('zod');
      return z
        .object({
          cardSetId: z.string(),
          density: DensityEnum,
        })
        .parse(raw);
    })
    .query(async ({ ctx, input }) => {
      const setRow = ctx.db
        .select()
        .from(cardSets)
        .where(and(eq(cardSets.id, input.cardSetId), eq(cardSets.userId, ctx.user.userId)))
        .all()[0];
      if (!setRow) throw new Error('卡片组不存在或无权访问');

      const cardRows = ctx.db
        .select()
        .from(cards)
        .where(eq(cards.cardSetId, input.cardSetId))
        .all();
      const layoutInput: LayoutInput = {
        cards: cardRows.map((c) => ({
          cardId: c.id,
          type: c.type as 'qa' | 'cloze' | 'mindmap',
          front: renderCardText(c.type, JSON.parse(c.payload), 'front'),
          back: renderCardText(c.type, JSON.parse(c.payload), 'back'),
        })),
        density: input.density,
      };
      return layout(layoutInput);
    }),

  /** 异步 PDF 导出（写入 quota_counters，10 次/天） */
  exportPdf: protectedProcedure
    .input(async (raw: unknown) => {
      const z = await import('zod');
      return z
        .object({ cardSetId: z.string(), density: DensityEnum })
        .parse(raw);
    })
    .mutation(async ({ ctx, input }) => {
      const kv = await getKVStore();
      const period = dayPeriod();
      const limit = env.QUOTA_PDF_DAILY_FREE;
      const key = `quota:${ctx.user.userId}:pdf_daily:${period}`;
      const usedStr = await kv.get(key);
      const used = usedStr ? Number(usedStr) : 0;
      if (used >= limit) {
        return { ok: false as const, error: `今日 PDF 导出次数已用完（${limit} 次/天）` };
      }

      // 立即扣减 + 25 小时 TTL
      await kv.incr(key, 25 * 60 * 60);

      // 生成 PDF 任务 ID（实际渲染由 worker 异步完成，前端轮询下载链接）
      const jobId = nanoid();
      // 触发 worker：通过 generateQueue 复用结构（实际项目应有独立 pdfQueue）
      // 这里同步触发，避免引入第二个队列
      try {
        const { renderPdf } = await import('../../pdf/worker.js');
        const setRow = ctx.db
          .select()
          .from(cardSets)
          .where(and(eq(cardSets.id, input.cardSetId), eq(cardSets.userId, ctx.user.userId)))
          .all()[0];
        if (!setRow) throw new Error('卡片组不存在或无权访问');
        const cardRows = ctx.db
          .select()
          .from(cards)
          .where(eq(cards.cardSetId, input.cardSetId))
          .all();
        const { renderCardText } = await import('../../print/render.js');
        const { layout } = await import('@kaotu/shared/print');
        const layoutInput = {
          cards: cardRows.map((c) => ({
            cardId: c.id,
            type: c.type as 'qa' | 'cloze' | 'mindmap',
            front: renderCardText(c.type, JSON.parse(c.payload), 'front'),
            back: renderCardText(c.type, JSON.parse(c.payload), 'back'),
          })),
          density: input.density,
        };
        const layoutResult = layout(layoutInput);
        const pdfBuffer = await renderPdf(layoutResult);
        // base64 一次性返回（实际项目可写 OSS 返回链接）
        const base64 = pdfBuffer.toString('base64');
        return {
          ok: true as const,
          jobId,
          base64,
          filename: `${setRow.title}-${input.density}等分.pdf`,
          contentType: 'application/pdf',
        };
      } catch (e) {
        // 失败返还配额
        await kv.decr(key);
        throw e;
      }
    }),
});
