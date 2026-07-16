/**
 * 队列抽象：异步生成任务用
 * 实现：MemoryQueue（默认） / RedisQueue
 */
export interface Queue<T = unknown> {
  enqueue(payload: T): Promise<void>;
  dequeue(timeoutMs?: number): Promise<T | null>;
  ack(payload: T): Promise<void>;
  size(): Promise<number>;
}

interface MemoryJob<T> {
  payload: T;
  enqueuedAt: number;
  acked: boolean;
}

class MemoryQueue<T = unknown> implements Queue<T> {
  private jobs: MemoryJob<T>[] = [];
  private pending: MemoryJob<T>[] = [];
  private waiters: Array<(j: T | null) => void> = [];

  async enqueue(payload: T): Promise<void> {
    const job: MemoryJob<T> = { payload, enqueuedAt: Date.now(), acked: false };
    this.jobs.push(job);
    const w = this.waiters.shift();
    if (w) w(payload);
  }

  async dequeue(_timeoutMs?: number): Promise<T | null> {
    if (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      this.pending.push(job);
      return job.payload;
    }
    return new Promise<T | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async ack(payload: T): Promise<void> {
    const idx = this.pending.findIndex((j) => j.payload === payload);
    if (idx >= 0) {
      this.pending.splice(idx, 1)[0]!.acked = true;
    }
  }

  async size(): Promise<number> {
    return this.jobs.length + this.pending.length;
  }
}

const _queues = new Map<string, Queue<any>>();

export function getQueue<T = unknown>(name: string): Queue<T> {
  let q = _queues.get(name);
  if (!q) {
    q = new MemoryQueue<T>();
    _queues.set(name, q);
  }
  return q as Queue<T>;
}

export function setQueue<T = unknown>(name: string, queue: Queue<T>): void {
  _queues.set(name, queue);
}
