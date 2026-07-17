/**
 * tRPC 上下文：携带 Hono 的 c 变量（user、kv、db 等）
 */
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import type { KVStore } from '../infra/kvstore.js';
import type { Db } from '../db/client.js';
import type { Queue } from '../infra/queue-memory.js';
import type { GenerationJobPayload } from '../ai/types.js';

export interface AppContext {
  db: Db;
  kv: KVStore;
  generateQueue: Queue<GenerationJobPayload>;
  user: { userId: string; email: string; plan: 'free' | 'pro' } | null;
  request: Request;
}

export async function createContext(
  opts: FetchCreateContextFnOptions,
  deps: { db: Db; kv: KVStore; generateQueue: Queue<GenerationJobPayload> },
  getUser: (req: Request) => AppContext['user'],
): Promise<AppContext> {
  return {
    db: deps.db,
    kv: deps.kv,
    generateQueue: deps.generateQueue,
    user: getUser(opts.req),
    request: opts.req,
  };
}
