/**
 * 认证契约
 */
import { z } from 'zod';

export const SendCodeInputSchema = z.object({
  email: z.string().email(),
});
export type SendCodeInput = z.infer<typeof SendCodeInputSchema>;

export const VerifyCodeInputSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});
export type VerifyCodeInput = z.infer<typeof VerifyCodeInputSchema>;

export const AuthMeSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  plan: z.enum(['free', 'pro']).default('free'),
});
export type AuthMe = z.infer<typeof AuthMeSchema>;
