/**
 * Drizzle schema - SQLite 兼容（生产 MySQL 8 由迁移脚本补充 ENUM/CHECK）
 *
 * 8 张表：users / login_codes / source_documents / card_sets / cards /
 *        review_states / review_logs / generation_jobs
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = sql`(unixepoch())`;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  plan: text('plan').notNull().default('free'), // free | pro
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const loginCodes = sqliteTable(
  'login_codes',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    code: text('code').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => ({
    emailIdx: index('login_codes_email_idx').on(t.email),
  }),
);

export const sourceDocuments = sqliteTable(
  'source_documents',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    charCount: integer('char_count').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    userIdx: index('source_documents_user_idx').on(t.userId),
  }),
);

export const cardSets = sqliteTable(
  'card_sets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    documentId: text('document_id').notNull(),
    title: text('title').notNull(),
    shareToken: text('share_token'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    userIdx: index('card_sets_user_idx').on(t.userId),
    docIdx: index('card_sets_doc_idx').on(t.documentId),
    shareIdx: index('card_sets_share_idx').on(t.shareToken),
  }),
);

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    cardSetId: text('card_set_id').notNull(),
    type: text('type').notNull(), // qa | cloze | mindmap
    sourceQuote: text('source_quote').notNull(),
    payload: text('payload').notNull(), // JSON
    tags: text('tags').notNull().default('[]'), // JSON array
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    setIdx: index('cards_set_idx').on(t.cardSetId),
  }),
);

export const reviewStates = sqliteTable(
  'review_states',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    userId: text('user_id').notNull(),
    step: integer('step').notNull().default(0),
    ef: integer('ef').notNull().default(2500), // 存整数 * 1000，避免浮点
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    dueAt: integer('due_at').notNull(),
    lastReviewedAt: integer('last_reviewed_at'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    userDueIdx: index('review_states_user_due_idx').on(t.userId, t.dueAt),
    cardUserIdx: index('review_states_card_user_idx').on(t.cardId, t.userId),
  }),
);

export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    userId: text('user_id').notNull(),
    grade: text('grade').notNull(),
    quality: integer('quality').notNull(),
    prevInterval: integer('prev_interval').notNull(),
    nextInterval: integer('next_interval').notNull(),
    prevEf: integer('prev_ef').notNull(),
    nextEf: integer('next_ef').notNull(),
    clientEventId: text('client_event_id').notNull(),
    reviewedAt: integer('reviewed_at').notNull().default(now),
  },
  (t) => ({
    userCardIdx: index('review_logs_user_idx').on(t.userId, t.reviewedAt),
    clientEventIdx: index('review_logs_client_event_idx').on(t.userId, t.clientEventId),
  }),
);

export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    documentId: text('document_id').notNull(),
    cardSetId: text('card_set_id'),
    status: text('status').notNull().default('queued'), // queued|analyzing|extracting|generating|done|failed
    progress: integer('progress').notNull().default(0),
    config: text('config').notNull(), // JSON
    errorMessage: text('error_message'),
    cardCount: integer('card_count').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    userIdx: index('generation_jobs_user_idx').on(t.userId, t.createdAt),
  }),
);

export const quotaCounters = sqliteTable(
  'quota_counters',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(), // generate_monthly | pdf_daily | config_chat_daily
    period: text('period').notNull(), // YYYY-MM 或 YYYY-MM-DD
    used: integer('used').notNull().default(0),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => ({
    userKindPeriodIdx: index('quota_user_kind_period_idx').on(t.userId, t.kind, t.period),
  }),
);

export type DbUser = typeof users.$inferSelect;
export type DbLoginCode = typeof loginCodes.$inferSelect;
export type DbSourceDocument = typeof sourceDocuments.$inferSelect;
export type DbCardSet = typeof cardSets.$inferSelect;
export type DbCard = typeof cards.$inferSelect;
export type DbReviewState = typeof reviewStates.$inferSelect;
export type DbReviewLog = typeof reviewLogs.$inferSelect;
export type DbGenerationJob = typeof generationJobs.$inferSelect;
export type DbQuotaCounter = typeof quotaCounters.$inferSelect;
