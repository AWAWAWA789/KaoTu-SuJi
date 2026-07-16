/**
 * 离线卡片包 - IndexedDB 存储
 * 断网时可复习、评分本地暂存、联网自动同步（幂等去重）
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { Grade } from '@kaotu/shared';

const DB_NAME = 'kaotu-suji';
const DB_VERSION = 1;

interface CardRecord {
  id: string;
  type: string;
  sourceQuote: string;
  payload: unknown;
  cardSetId: string;
}

interface PendingGrade {
  id: string; // = clientEventId
  cardId: string;
  grade: Grade;
  createdAt: number;
  synced: boolean;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingGrades')) {
        const store = db.createObjectStore('pendingGrades', { keyPath: 'id' });
        store.createIndex('synced', 'synced');
      }
    },
  });
  return _db;
}

export async function cacheCards(cards: CardRecord[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cards', 'readwrite');
  for (const c of cards) {
    await tx.store.put(c);
  }
  await tx.done;
}

export async function getCachedCards(cardSetId?: string): Promise<CardRecord[]> {
  const db = await getDb();
  const all = (await db.getAll('cards')) as CardRecord[];
  return cardSetId ? all.filter((c) => c.cardSetId === cardSetId) : all;
}

export async function addPendingGrade(g: PendingGrade): Promise<void> {
  const db = await getDb();
  await db.put('pendingGrades', g);
}

export async function getPendingGrades(): Promise<PendingGrade[]> {
  const db = await getDb();
  return (await db.getAll('pendingGrades')) as PendingGrade[];
}

export async function markGradeSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('pendingGrades', id);
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear('cards');
  await db.clear('pendingGrades');
}

export type { CardRecord, PendingGrade };
