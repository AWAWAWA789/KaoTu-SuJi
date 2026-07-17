/**
 * KVStore 抽象：用于验证码 TTL、限流计数
 * 实现：MemoryKVStore（默认） / RedisKVStore
 */
export interface KVStore {
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  /** 原子自增（不存在则从 0 开始），返回自增后的值；可选 TTL 仅在首次创建时生效 */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** 原子自减（不低于 0），返回自减后的值 */
  decr(key: string): Promise<number>;
}

class MemoryKVStore implements KVStore {
  private map = new Map<string, { value: string; expiresAt?: number }>();

  private cleanKey(key: string): void {
    const v = this.map.get(key);
    if (v?.expiresAt !== undefined && v.expiresAt < Date.now()) {
      this.map.delete(key);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : undefined;
    this.map.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    this.cleanKey(key);
    return this.map.get(key)?.value ?? null;
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    this.cleanKey(key);
    const cur = this.map.get(key);
    const next = cur ? Number(cur.value) + 1 : 1;
    const expiresAt =
      ttlSeconds !== undefined && !cur ? Date.now() + ttlSeconds * 1000 : cur?.expiresAt;
    this.map.set(key, { value: String(next), expiresAt });
    return next;
  }

  async decr(key: string): Promise<number> {
    this.cleanKey(key);
    const cur = this.map.get(key);
    if (!cur) return 0;
    const next = Math.max(0, Number(cur.value) - 1);
    this.map.set(key, { value: String(next), expiresAt: cur.expiresAt });
    return next;
  }
}

let _instance: KVStore | null = null;

export async function getKVStore(): Promise<KVStore> {
  if (_instance) return _instance;
  // Redis 由调用方在 server/index.ts 中注入
  _instance = new MemoryKVStore();
  return _instance;
}

export function setKVStore(store: KVStore): void {
  _instance = store;
}
