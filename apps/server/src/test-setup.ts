/**
 * Vitest 全局 setup - 提供 SQLite 测试 DB
 */
import { beforeAll, afterAll } from 'vitest';
import { migrateSqlite } from './db/migrate.js';
import { closeDb } from './db/client.js';

let migrated = false;

beforeAll(() => {
  if (!migrated) {
    migrateSqlite();
    migrated = true;
  }
});

afterAll(async () => {
  await closeDb();
});
