/**
 * 数据库客户端工厂 - 根据 DATABASE_URL 协议段切换 SQLite / MySQL
 *
 * 默认 SQLite（better-sqlite3，Node 20 原生支持）
 * DATABASE_URL=mysql://... → MySQL（mysql2）
 *
 * 类型层面统一以 SQLite 类型暴露（drizzle query builder API 在两种 dialect
 * 下高度兼容，鸭子类型工作良好；MySQL 仅在运行时分支使用）。
 */
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';
import { env } from '../config/env.js';

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;
let _sqlite: Database.Database | null = null;
let _mysqlPool: mysql.Pool | null = null;

function isMysqlUrl(url: string): boolean {
  return url.startsWith('mysql://') || url.startsWith('mysql://');
}

export function getDb(): Db {
  if (_db) return _db;

  const url = env.DATABASE_URL;
  if (isMysqlUrl(url)) {
    _mysqlPool = mysql.createPool({ uri: url, multipleStatements: true });
    // 运行时使用 MySQL，类型仍以 SQLite 暴露（API 兼容）
    _db = drizzleMysql(_mysqlPool, { schema, mode: 'default' }) as unknown as Db;
  } else {
    // SQLite
    const match = url.match(/^file:(.+)$/);
    const dbPath = match ? match[1]! : './data/app.db';
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
    _db = drizzleSqlite(_sqlite, { schema });
  }
  return _db;
}

export function getRawSqlite(): Database.Database {
  if (!_sqlite) {
    // 触发初始化
    getDb();
  }
  return _sqlite!;
}

export async function closeDb(): Promise<void> {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
  }
  if (_mysqlPool) {
    await _mysqlPool.end();
    _mysqlPool = null;
  }
  _db = null;
}
