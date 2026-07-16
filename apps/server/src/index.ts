/**
 * 考途速记 - 服务端入口
 *
 * 启动流程：
 * 1. 加载 env / 初始化 DB / 迁移
 * 2. 初始化 KVStore（Redis 或内存）
 * 3. 初始化 generateQueue（Redis 或内存）
 * 4. 启动 generation worker
 * 5. 暴露 /health + /api/trpc + /api/sse/generation/:jobId
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { eq } from 'drizzle-orm';
import { serve } from '@hono/node-server';
import { env } from './config/env.js';
import { getDb, closeDb } from './db/client.js';
import { migrateSqlite } from './db/migrate.js';
import { getKVStore, setKVStore } from './infra/kvstore.js';
import { getQueue, setQueue } from './infra/queue-memory.js';
import { getRedis, RedisKVStore, RedisQueue, closeRedis } from './infra/redis.js';
import { appRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';
import { resolveUser, getTokenFromRequest } from './trpc/routers/auth.js';
import { signSession, verifySession, shouldRenew } from './auth/jwt.js';
import { buildProviderChain } from './ai/generate.js';
import { startGenerationWorker } from './ai/worker.js';
import { generationJobs, loginCodes } from './db/schema.js';
import type { GenerationJobPayload } from './ai/types.js';

async function main() {
  // 1. DB
  migrateSqlite();
  const db = getDb();

  // 2. KVStore / Queue
  let kv = await getKVStore();
  let generateQueue = getQueue<GenerationJobPayload>('generation');
  if (env.REDIS_URL) {
    const redis = getRedis(env.REDIS_URL);
    kv = new RedisKVStore(redis);
    setKVStore(kv);
    generateQueue = new RedisQueue<GenerationJobPayload>(redis, 'generation');
    setQueue('generation', generateQueue);
    console.log('[server] using Redis for KV + Queue');
  } else {
    console.log('[server] using in-memory KV + Queue (dev)');
  }

  // 3. LLM Provider
  const provider = buildProviderChain({
    llmProvider: env.LLM_PROVIDER,
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL,
    deepseekModel: env.DEEPSEEK_MODEL,
    moonshotApiKey: env.MOONSHOT_API_KEY,
    moonshotBaseUrl: env.MOONSHOT_BASE_URL,
    moonshotModel: env.MOONSHOT_MODEL,
  });
  console.log(`[server] LLM provider: ${provider.name}`);

  // 4. Worker
  await startGenerationWorker({ db, kv, queue: generateQueue, provider });
  console.log('[server] generation worker started');

  // 5. Hono app
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: env.APP_URL ?? 'http://localhost:5173',
      credentials: true,
    }),
  );

  // 健康检查
  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'kaotu-suji-server',
      version: '0.1.0',
      provider: provider.name,
      time: Date.now(),
    }),
  );

  // 把 tRPC verifyCode 返回的 token 写入 httpOnly cookie
  // tRPC mutation 无法直接操作 Set-Cookie，故由 Hono 中间路由承担
  app.post('/api/auth/session', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    if (!body.token) {
      return c.json({ ok: false, error: 'missing token' }, 400);
    }
    c.header(
      'Set-Cookie',
      `ks_session=${body.token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${env.isProd ? '; Secure' : ''}`,
    );
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    c.header('Set-Cookie', 'ks_session=; HttpOnly; Path=/; Max-Age=0');
    return c.json({ ok: true });
  });

  // dev-only：读取最近一条未消费验证码（仅供 e2e/本地调试，生产环境禁用）
  app.get('/api/dev/latest-code', (c) => {
    if (env.isProd) {
      return c.json({ ok: false, error: 'disabled in production' }, 404);
    }
    const email = c.req.query('email');
    if (!email) {
      return c.json({ ok: false, error: 'missing email' }, 400);
    }
    const rows = db
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.email, email))
      .orderBy(loginCodes.createdAt)
      .all();
    if (rows.length === 0) {
      return c.json({ ok: false, error: 'no code found' }, 404);
    }
    const latest = rows[rows.length - 1]!;
    return c.json({ ok: true, code: latest.code });
  });

  // tRPC - 使用官方 fetch adapter，支持异步 createContext
  app.use('/api/trpc/*', (c) => {
    return fetchRequestHandler({
      endpoint: '/api/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: async (opts) => {
        const user = await resolveUser(opts.req);
        return createContext(opts, { db, kv, generateQueue }, () => user);
      },
    });
  });

  // SSE 进度推送
  app.get('/api/sse/generation/:jobId', (c) => {
    const jobId = c.req.param('jobId');
    return streamSSE(c, async (stream) => {
      let lastStatus = '';
      let lastProgress = -1;
      let loops = 0;
      const maxLoops = 60 * 5;
      while (loops < maxLoops) {
        const row = db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, jobId))
          .all()[0];
        if (!row) {
          await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: 'job not found' }) });
          break;
        }
        if (row.status !== lastStatus || row.progress !== lastProgress) {
          lastStatus = row.status;
          lastProgress = row.progress;
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'progress',
              status: row.status,
              progress: row.progress,
              cardCount: row.cardCount,
              errorMessage: row.errorMessage,
            }),
          });
        }
        if (row.status === 'done' || row.status === 'failed') {
          await stream.writeSSE({ data: JSON.stringify({ type: 'done', status: row.status }) });
          break;
        }
        loops++;
        await stream.sleep(1000);
      }
    });
  });

  // 启动
  const port = env.APP_PORT;
  console.log(`[server] listening on http://localhost:${port}`);
  const server = serve({ fetch: app.fetch, port });

  // 优雅退出
  const shutdown = async () => {
    console.log('[server] shutting down...');
    server.close();
    await closeRedis();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** 续签 cookie：若 token 剩余 <1 天，则下发新 token（供 tRPC middleware 用） */
export async function renewIfClose(req: Request): Promise<string | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  if (shouldRenew(payload)) {
    const { token: newToken } = await signSession({
      userId: payload.userId,
      email: payload.email,
      plan: payload.plan,
    });
    return newToken;
  }
  return null;
}

main().catch((e) => {
  console.error('[server] fatal:', e);
  process.exit(1);
});
