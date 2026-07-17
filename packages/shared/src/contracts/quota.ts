/**
 * 配额契约
 */
import { z } from 'zod';

export const QuotaCheckSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  resetAt: z.number().int(),
});
export type QuotaCheck = z.infer<typeof QuotaCheckSchema>;
