/**
 * Redis 实现 - 当 REDIS_URL 存在时启用
 * 同 KVStore / Queue 接口，便于水平扩展
 */
import type { KVStore } from './kvstore.js';
import type { Queue as QueueIface } from './queue-memory.js';
import Redis from 'ioredis';

export class RedisKVStore implements KVStore {
  constructor(private redis: Redis) {}

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const v = await this.redis.incr(key);
    if (v === 1 && ttlSeconds !== undefined) {
      await this.redis.expire(key, ttlSeconds);
    }
    return v;
  }
  async decr(key: string): Promise<number> {
    const v = await this.redis.decr(key);
    return Math.max(0, v);
  }
}

export class RedisQueue<T = unknown> implements QueueIface<T> {
  constructor(private redis: Redis, private name: string) {}

  async enqueue(payload: T): Promise<void> {
    await this.redis.rpush(`queue:${this.name}`, JSON.stringify(payload));
  }
  async dequeue(timeoutMs = 5000): Promise<T | null> {
    const r = await this.redis.blpop(`queue:${this.name}`, Math.ceil(timeoutMs / 1000));
    if (!r) return null;
    const [, raw] = r;
    return JSON.parse(raw) as T;
  }
  async ack(_payload: T): Promise<void> {
    // Redis BLPOP 即时出队，无需显式 ack；如需 at-least-once 可改用 streams
  }
  async size(): Promise<number> {
    return this.redis.llen(`queue:${this.name}`);
  }
}

let _redis: Redis | null = null;

export function getRedis(url: string): Redis {
  if (!_redis) {
    _redis = new Redis(url);
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

// 满足 TS 未使用导入
export type { KVStore };
