/**
 * 迁移脚本：可重复执行（idempotent）
 * - SQLite：CREATE TABLE IF NOT EXISTS
 * - MySQL：生产口径由 prod-mysql.sql 补充 ENUM/CHECK
 */
import { getRawSqlite } from './client.js';

const SQLITE_DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS login_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes(email)`,
  `CREATE TABLE IF NOT EXISTS source_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS source_documents_user_idx ON source_documents(user_id)`,
  `CREATE TABLE IF NOT EXISTS card_sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    title TEXT NOT NULL,
    share_token TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS card_sets_user_idx ON card_sets(user_id)`,
  `CREATE INDEX IF NOT EXISTS card_sets_doc_idx ON card_sets(document_id)`,
  `CREATE INDEX IF NOT EXISTS card_sets_share_idx ON card_sets(share_token)`,
  `CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    card_set_id TEXT NOT NULL,
    type TEXT NOT NULL,
    source_quote TEXT NOT NULL,
    payload TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS cards_set_idx ON cards(card_set_id)`,
  `CREATE TABLE IF NOT EXISTS review_states (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    step INTEGER NOT NULL DEFAULT 0,
    ef INTEGER NOT NULL DEFAULT 2500,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER NOT NULL,
    last_reviewed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS review_states_user_due_idx ON review_states(user_id, due_at)`,
  `CREATE INDEX IF NOT EXISTS review_states_card_user_idx ON review_states(card_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS review_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    quality INTEGER NOT NULL,
    prev_interval INTEGER NOT NULL,
    next_interval INTEGER NOT NULL,
    prev_ef INTEGER NOT NULL,
    next_ef INTEGER NOT NULL,
    client_event_id TEXT NOT NULL,
    reviewed_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS review_logs_user_idx ON review_logs(user_id, reviewed_at)`,
  `CREATE INDEX IF NOT EXISTS review_logs_client_event_idx ON review_logs(user_id, client_event_id)`,
  `CREATE TABLE IF NOT EXISTS generation_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    card_set_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL,
    error_message TEXT,
    card_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS generation_jobs_user_idx ON generation_jobs(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS quota_counters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    period TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS quota_user_kind_period_idx ON quota_counters(user_id, kind, period)`,
];

export function migrateSqlite(): void {
  const db = getRawSqlite();
  const tx = db.transaction(() => {
    for (const ddl of SQLITE_DDL) {
      db.exec(ddl);
    }
  });
  tx();
}

// 直接运行时执行迁移
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateSqlite();
  console.log('[migrate] SQLite schema applied successfully');
}
