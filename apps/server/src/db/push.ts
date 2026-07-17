/**
 * db:push - 简易入口，等价 migrate + seed
 */
import { migrateSqlite } from './migrate.js';

migrateSqlite();
console.log('[db:push] schema pushed');
