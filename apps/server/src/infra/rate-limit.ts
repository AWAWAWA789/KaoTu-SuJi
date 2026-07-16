/**
 * 限流器 - 基于 KVStore
 * 滑动窗口：windowSeconds 内最多 maxCount 次
 */
import type { KVStore } from './kvstore.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  kv: KVStore,
  key: string,
  maxCount: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const count = await kv.incr(key, windowSeconds);
  const remaining = Math.max(0, maxCount - count);
  return {
    allowed: count <= maxCount,
    remaining,
    resetAt: Date.now() + windowSeconds * 1000,
  };
}
