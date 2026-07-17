/**
 * 复习契约
 */
import { z } from 'zod';

export const GradeEnum = z.enum(['again', 'hard', 'easy']);
export type Grade = z.infer<typeof GradeEnum>;

/** 三档评分映射（指令书要求：不认识=1/模糊=3/已掌握=5） */
export const GRADE_TO_QUALITY: Record<Grade, number> = {
  again: 1,
  hard: 3,
  easy: 5,
};

export const ReviewStateSchema = z.object({
  cardId: z.string(),
  userId: z.string(),
  step: z.number().int().nonnegative(),
  ef: z.number(),
  intervalDays: z.number().int().nonnegative(),
  repetitions: z.number().int().nonnegative(),
  dueAt: z.number().int(),
  lastReviewedAt: z.number().int().nullable(),
});
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const SubmitGradeInputSchema = z.object({
  cardId: z.string(),
  grade: GradeEnum,
  clientEventId: z.string().min(1).describe('幂等键'),
});
export type SubmitGradeInput = z.infer<typeof SubmitGradeInputSchema>;

export const ReviewLogSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  userId: z.string(),
  grade: GradeEnum,
  quality: z.number().int(),
  prevInterval: z.number().int(),
  nextInterval: z.number().int(),
  prevEf: z.number(),
  nextEf: z.number(),
  reviewedAt: z.number().int(),
});
export type ReviewLog = z.infer<typeof ReviewLogSchema>;

export const ReviewStatsSchema = z.object({
  retentionRate: z.number().min(0).max(1),
  streakDays: z.number().int().nonnegative(),
  dueCount: z.number().int().nonnegative(),
  totalReviewed: z.number().int().nonnegative(),
  heatmap: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type ReviewStats = z.infer<typeof ReviewStatsSchema>;
