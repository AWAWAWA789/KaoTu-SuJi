/**
 * 生成管线 - 任务入队
 * SSE 进度推送由 Hono 路由直接处理（见 server/index.ts）
 */
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { router, protectedProcedure } from '../instance.js';
import { GenerationConfigSchema } from '@kaotu/shared';
import { generationJobs, sourceDocuments, cardSets } from '../../db/schema.js';
import { getKVStore } from '../../infra/kvstore.js';
import { env } from '../../config/env.js';
import type { GenerationJobPayload } from '../../ai/types.js';

function monthPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function checkGenerateQuota(
  kv: Awaited<ReturnType<typeof getKVStore>>,
  userId: string,
  plan: 'free' | 'pro',
): Promise<{ allowed: boolean; used: number; limit: number; period: string }> {
  const period = monthPeriod();
  const key = `quota:${userId}:generate_monthly:${period}`;
  const usedStr = await kv.get(key);
  const used = usedStr ? Number(usedStr) : 0;
  const limit = plan === 'pro' ? 9999 : env.QUOTA_GENERATE_MONTHLY_FREE;
  return { allowed: used < limit, used, limit, period };
}

export async function incrGenerateQuota(
  kv: Awaited<ReturnType<typeof getKVStore>>,
  userId: string,
): Promise<void> {
  const period = monthPeriod();
  const key = `quota:${userId}:generate_monthly:${period}`;
  // 月度配额 TTL = 35 天
  await kv.incr(key, 35 * 24 * 60 * 60);
}

export const generationRouter = router({
  createJob: protectedProcedure
    .input(async (raw: unknown) => {
      const z = await import('zod');
      return z
        .object({
          documentId: z.string(),
          title: z.string().min(1).max(200),
          config: GenerationConfigSchema,
        })
        .parse(raw);
    })
    .mutation(async ({ ctx, input }) => {
      // 1. 校验文档归属
      const doc = ctx.db
        .select()
        .from(sourceDocuments)
        .where(
          and(eq(sourceDocuments.id, input.documentId), eq(sourceDocuments.userId, ctx.user.userId)),
        )
        .all()[0];
      if (!doc) throw new Error('文档不存在或无权访问');

      // 2. 配额检查
      const kv = await getKVStore();
      const q = await checkGenerateQuota(kv, ctx.user.userId, ctx.user.plan);
      if (!q.allowed) {
        return {
          ok: false as const,
          error: `本月生成次数已用完（${q.limit} 次/月），升级 Pro 或下月重置`,
        };
      }

      // 3. 创建卡片组
      const cardSetId = nanoid();
      await ctx.db
        .insert(cardSets)
        .values({
          id: cardSetId,
          userId: ctx.user.userId,
          documentId: input.documentId,
          title: input.title,
        })
        .run();

      // 4. 创建任务
      const jobId = nanoid();
      await ctx.db
        .insert(generationJobs)
        .values({
          id: jobId,
          userId: ctx.user.userId,
          documentId: input.documentId,
          cardSetId,
          status: 'queued',
          progress: 0,
          config: JSON.stringify(input.config),
        })
        .run();

      // 5. 占用配额（失败由 worker 自动返还）
      await incrGenerateQuota(kv, ctx.user.userId);

      // 6. 入队
      const payload: GenerationJobPayload = {
        jobId,
        userId: ctx.user.userId,
        documentId: input.documentId,
        cardSetId,
        config: input.config,
      };
      await ctx.generateQueue.enqueue(payload);

      return { ok: true as const, jobId, cardSetId };
    }),

  status: protectedProcedure
    .input(async (raw: unknown) => {
      const z = await import('zod');
      return z.object({ jobId: z.string() }).parse(raw);
    })
    .query(async ({ ctx, input }) => {
      const row = ctx.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, input.jobId))
        .all()[0];
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        progress: row.progress,
        cardCount: row.cardCount,
        errorMessage: row.errorMessage,
        cardSetId: row.cardSetId,
      };
    }),
});
