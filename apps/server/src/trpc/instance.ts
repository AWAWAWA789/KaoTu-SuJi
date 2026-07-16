/**
 * tRPC 实例 - 路由组装点
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { AppContext } from './context.js';

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** 需要登录的 procedure */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' });
  }
  return next({
    ctx: { ...ctx, user: ctx.user },
  });
});
