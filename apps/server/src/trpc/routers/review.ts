/**
 * 复习路由 - 今日队列 / 评分 / 统计
 * SM-2 调度由 @kaotu/shared/srs 提供（前后端共用纯函数）
 *
 * 评分幂等：review_logs.client_event_id 作为去重键
 */
import { eq, and, lte, desc, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { router, protectedProcedure } from '../instance.js';
import { SubmitGradeInputSchema, GRADE_TO_QUALITY } from '@kaotu/shared';
import {
  schedule,
  newCardState,
  type SrsState,
} from '@kaotu/shared/srs';
import { cards, cardSets, reviewStates, reviewLogs } from '../../db/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 数据库 ef 存整数 *1000，需互转 */
function dbToState(row: typeof reviewStates.$inferSelect): SrsState {
  return {
    step: row.step,
    ef: row.ef / 1000,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    dueAt: row.dueAt * 1000,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt * 1000 : null,
  };
}

export const reviewRouter = router({
  /** 今日到期队列（≤50 张） */
  todayQueue: protectedProcedure
    .input(async (raw: unknown) => {
      const z = await import('zod');
      return z.object({ limit: z.number().int().min(1).max(50).default(50) }).parse(raw);
    })
    .query(async ({ ctx, input }) => {
      const nowSec = Math.floor(Date.now() / 1000);
      // 查找当前用户的复习状态 + 关联卡片
      const stateRows = ctx.db
        .select()
        .from(reviewStates)
        .where(
          and(eq(reviewStates.userId, ctx.user.userId), lte(reviewStates.dueAt, nowSec)),
        )
        .limit(input.limit)
        .all();

      // 也查找用户卡片组中"还没初始化复习状态"的卡片（新卡）
      const userSets = ctx.db
        .select()
        .from(cardSets)
        .where(eq(cardSets.userId, ctx.user.userId))
        .all();
      const setIds = userSets.map((s) => s.id);
      if (setIds.length === 0) return [];

      const allCards = setIds.length
        ? ctx.db.select().from(cards).where(inArray(cards.cardSetId, setIds)).all()
        : [];
      const cardsWithState = new Map(stateRows.map((r) => [r.cardId, r]));
      const newCards = allCards.filter((c) => !cardsWithState.has(c.id));

      const queue: Array<{
        cardId: string;
        type: string;
        sourceQuote: string;
        payload: unknown;
        isNew: boolean;
      }> = [];

      for (const r of stateRows) {
        if (queue.length >= input.limit) break;
        const card = ctx.db.select().from(cards).where(eq(cards.id, r.cardId)).all()[0];
        if (!card) continue;
        queue.push({
          cardId: card.id,
          type: card.type,
          sourceQuote: card.sourceQuote,
          payload: JSON.parse(card.payload),
          isNew: false,
        });
      }
      for (const c of newCards) {
        if (queue.length >= input.limit) break;
        queue.push({
          cardId: c.id,
          type: c.type,
          sourceQuote: c.sourceQuote,
          payload: JSON.parse(c.payload),
          isNew: true,
        });
      }
      return queue;
    }),

  /** 提交评分（幂等） */
  submitGrade: protectedProcedure
    .input(SubmitGradeInputSchema)
    .mutation(async ({ ctx, input }) => {
      // 幂等：同一 clientEventId 已存在则直接返回原结果
      const existingLog = ctx.db
        .select()
        .from(reviewLogs)
        .where(
          and(
            eq(reviewLogs.userId, ctx.user.userId),
            eq(reviewLogs.clientEventId, input.clientEventId),
          ),
        )
        .all()[0];
      if (existingLog) {
        return { ok: true, duplicated: true, logId: existingLog.id };
      }

      // 校验卡片归属
      const card = ctx.db.select().from(cards).where(eq(cards.id, input.cardId)).all()[0];
      if (!card) throw new Error('卡片不存在');
      const setRow = ctx.db
        .select()
        .from(cardSets)
        .where(and(eq(cardSets.id, card.cardSetId), eq(cardSets.userId, ctx.user.userId)))
        .all()[0];
      if (!setRow) throw new Error('无权复习此卡片');

      const now = Date.now();
      const nowSec = Math.floor(now / 1000);
      const quality = GRADE_TO_QUALITY[input.grade];

      // 取当前状态（不存在则新建）
      let stateRow = ctx.db
        .select()
        .from(reviewStates)
        .where(and(eq(reviewStates.cardId, input.cardId), eq(reviewStates.userId, ctx.user.userId)))
        .all()[0];
      const prevState: SrsState = stateRow
        ? dbToState(stateRow)
        : newCardState(now);

      const result = schedule(prevState, input.grade, now);

      // 写入 reviewState
      if (stateRow) {
        ctx.db
          .update(reviewStates)
          .set({
            step: result.state.step,
            ef: Math.round(result.state.ef * 1000),
            intervalDays: result.state.intervalDays,
            repetitions: result.state.repetitions,
            dueAt: Math.floor(result.state.dueAt / 1000),
            lastReviewedAt: nowSec,
            updatedAt: nowSec,
          })
          .where(eq(reviewStates.id, stateRow.id))
          .run();
      } else {
        const id = nanoid();
        ctx.db
          .insert(reviewStates)
          .values({
            id,
            cardId: input.cardId,
            userId: ctx.user.userId,
            step: result.state.step,
            ef: Math.round(result.state.ef * 1000),
            intervalDays: result.state.intervalDays,
            repetitions: result.state.repetitions,
            dueAt: Math.floor(result.state.dueAt / 1000),
            lastReviewedAt: nowSec,
          })
          .run();
        stateRow = ctx.db.select().from(reviewStates).where(eq(reviewStates.id, id)).all()[0];
      }

      // 写入 review_log
      const logId = nanoid();
      ctx.db
        .insert(reviewLogs)
        .values({
          id: logId,
          cardId: input.cardId,
          userId: ctx.user.userId,
          grade: input.grade,
          quality,
          prevInterval: result.prevInterval,
          nextInterval: result.nextInterval,
          prevEf: Math.round(result.prevEf * 1000),
          nextEf: Math.round(result.nextEf * 1000),
          clientEventId: input.clientEventId,
        })
        .run();

      return { ok: true, duplicated: false, logId, nextDueAt: result.state.dueAt };
    }),

  /** 统计：保持率 / 连续天数 / 待复习数 / 30 天热力 */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const nowSec = Math.floor(Date.now() / 1000);

    // 待复习数
    const dueRows = ctx.db
      .select({ id: reviewStates.id })
      .from(reviewStates)
      .where(and(eq(reviewStates.userId, ctx.user.userId), lte(reviewStates.dueAt, nowSec)))
      .all();
    const dueCount = dueRows.length;

    // 总复习次数 + 最近 30 天日志
    const since30 = nowSec - 30 * 24 * 60 * 60;
    const logs30 = ctx.db
      .select()
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, ctx.user.userId), sql`${reviewLogs.reviewedAt} >= ${since30}`))
      .all();

    const totalReviewed = logs30.length;
    const easyHard = logs30.filter((l) => l.grade !== 'again').length;
    const retentionRate = totalReviewed === 0 ? 0 : easyHard / totalReviewed;

    // 连续天数：从今天往前推，连续有日志的天数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daySet = new Set<string>();
    for (const l of logs30) {
      const d = new Date(l.reviewedAt * 1000);
      d.setHours(0, 0, 0, 0);
      daySet.add(formatDate(d));
    }
    let streakDays = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * DAY_MS);
      if (daySet.has(formatDate(d))) {
        streakDays++;
      } else if (i === 0) {
        // 今天还没复习，不算中断（昨天起算连续）
        continue;
      } else {
        break;
      }
    }

    // 30 天热力
    const heatmap: { date: string; count: number }[] = [];
    const countByDate = new Map<string, number>();
    for (const l of logs30) {
      const d = new Date(l.reviewedAt * 1000);
      d.setHours(0, 0, 0, 0);
      const key = formatDate(d);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const key = formatDate(d);
      heatmap.push({ date: key, count: countByDate.get(key) ?? 0 });
    }

    return {
      retentionRate,
      streakDays,
      dueCount,
      totalReviewed,
      heatmap,
    };
  }),
});

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 满足导入占位
void desc;
