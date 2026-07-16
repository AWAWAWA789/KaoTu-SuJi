/**
 * 认证路由 - 邮箱验证码登录
 */
import { nanoid } from 'nanoid';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { router, publicProcedure } from '../instance.js';
import { SendCodeInputSchema, VerifyCodeInputSchema } from '@kaotu/shared';
import { users, loginCodes } from '../../db/schema.js';
import { getKVStore } from '../../infra/kvstore.js';
import { rateLimit } from '../../infra/rate-limit.js';
import { sendLoginCode } from '../../auth/mailer.js';
import { signSession, verifySession } from '../../auth/jwt.js';

const CODE_TTL_SECONDS = 5 * 60;
const CODE_LEN = 6;

function genCode(): string {
  // 6 位数字，首位非 0
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += i === 0 ? String(1 + Math.floor(Math.random() * 9)) : String(Math.floor(Math.random() * 10));
  }
  return s;
}

/** 从 cookie 中解析 token */
export function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === 'ks_session' && v) return v;
  }
  return null;
}

export async function resolveUser(req: Request): Promise<
  { userId: string; email: string; plan: 'free' | 'pro' } | null
> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  return {
    userId: payload.userId,
    email: payload.email,
    plan: payload.plan,
  };
}

export const authRouter = router({
  sendCode: publicProcedure
    .input(SendCodeInputSchema)
    .mutation(async ({ ctx, input }) => {
      // 限流：1 次/分/邮箱
      const kv = await getKVStore();
      const rl = await rateLimit(kv, `rl:sendcode:${input.email}`, 1, 60);
      if (!rl.allowed) {
        return {
          ok: true, // 出于隐私与暴力枚举防护，统一返回 ok
          resetAt: rl.resetAt,
        };
      }

      const code = genCode();
      const expiresAt = Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS;
      await ctx.db
        .insert(loginCodes)
        .values({
          id: nanoid(),
          email: input.email,
          code,
          expiresAt,
        })
        .run();

      await sendLoginCode(input.email, code);

      return { ok: true, resetAt: rl.resetAt };
    }),

  verifyCode: publicProcedure
    .input(VerifyCodeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const now = Math.floor(Date.now() / 1000);
      // 查找未消费且未过期的最新一条
      const candidates = ctx.db
        .select()
        .from(loginCodes)
        .where(
          and(
            eq(loginCodes.email, input.email),
            eq(loginCodes.code, input.code),
            isNull(loginCodes.consumedAt),
            gt(loginCodes.expiresAt, now),
          ),
        )
        .all();

      if (candidates.length === 0) {
        return { ok: false as const, error: '验证码无效或已过期' };
      }

      const codeRow = candidates[0]!;
      // 标记已消费
      ctx.db
        .update(loginCodes)
        .set({ consumedAt: now })
        .where(eq(loginCodes.id, codeRow.id))
        .run();

      // upsert user
      const existing = ctx.db.select().from(users).where(eq(users.email, input.email)).all();
      let userId: string;
      let plan: 'free' | 'pro' = 'free';
      if (existing.length > 0) {
        userId = existing[0]!.id;
        plan = existing[0]!.plan as 'free' | 'pro';
      } else {
        userId = nanoid();
        ctx.db.insert(users).values({ id: userId, email: input.email, plan: 'free' }).run();
      }

      const { token, expiresInMs } = await signSession({
        userId,
        email: input.email,
        plan,
      });

      return {
        ok: true as const,
        token,
        expiresInMs,
        user: { userId, email: input.email, plan },
      };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  logout: publicProcedure.mutation(async () => {
    // JWT 是无状态的，前端清 cookie 即可
    return { ok: true };
  }),
});
