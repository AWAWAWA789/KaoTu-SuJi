/**
 * 生成 worker - 后台消费队列 → 调用 LLM → 写卡片
 * 失败时配额自动返还
 */
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '../db/client.js';
import type { KVStore } from '../infra/kvstore.js';
import type { Queue } from '../infra/queue-memory.js';
import { generationJobs, sourceDocuments, cards } from '../db/schema.js';
import type { LLMProvider, GenerateInput, GenerationJobPayload } from './types.js';

function monthPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function startGenerationWorker(deps: {
  db: Db;
  kv: KVStore;
  queue: Queue<GenerationJobPayload>;
  provider: LLMProvider;
}): Promise<() => Promise<void>> {
  const { db, kv, queue, provider } = deps;
  let running = true;

  const loop = async () => {
    while (running) {
      const payload = await queue.dequeue(30_000);
      if (!payload) continue;
      try {
        await processJob(db, kv, provider, payload);
      } catch (e) {
        console.error('[worker] job failed', payload.jobId, e);
      } finally {
        await queue.ack(payload);
      }
    }
  };
  void loop();

  return async () => {
    running = false;
  };
}

async function processJob(
  db: Db,
  kv: KVStore,
  provider: LLMProvider,
  payload: GenerationJobPayload,
): Promise<void> {
  const { jobId, documentId, cardSetId, config } = payload;

  const updateJob = (patch: Partial<typeof generationJobs.$inferInsert>) => {
    db.update(generationJobs)
      .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(generationJobs.id, jobId))
      .run();
  };

  try {
    updateJob({ status: 'analyzing', progress: 5 });

    const doc = db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId))
      .all()[0];
    if (!doc) throw new Error('文档不存在');

    const input: GenerateInput = {
      sourceText: doc.content,
      config,
      onProgress: (stage, progress) => {
        updateJob({ status: stage, progress });
      },
    };

    const output = await provider.generateCards(input);

    // 写卡片
    for (const card of output.cards) {
      db.insert(cards)
        .values({
          id: nanoid(),
          cardSetId,
          type: card.type,
          sourceQuote: card.sourceQuote,
          payload: JSON.stringify(card.payload),
          tags: JSON.stringify(card.tags),
        })
        .run();
    }

    updateJob({
      status: 'done',
      progress: 100,
      cardCount: output.cards.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateJob({ status: 'failed', errorMessage: msg });

    // 配额自动返还
    const period = monthPeriod();
    const key = `quota:${payload.userId}:generate_monthly:${period}`;
    await kv.decr(key);
    console.log(`[worker] quota refunded for user=${payload.userId} job=${jobId}`);
  }
}
