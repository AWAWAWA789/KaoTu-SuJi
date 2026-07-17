/**
 * 环境变量加载与校验
 */
import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function optional(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`env ${name} must be integer, got: ${v}`);
  }
  return n;
}

export const env = {
  APP_PORT: int('APP_PORT', 3000),
  APP_URL: optional('APP_URL', 'http://localhost:5173') ?? 'http://localhost:5173',
  NODE_ENV: optional('NODE_ENV', 'development') ?? 'development',
  isProd: (optional('NODE_ENV', 'development') ?? 'development') === 'production',

  LLM_PROVIDER: (optional('LLM_PROVIDER', 'mock') ?? 'mock') as
    | 'mock'
    | 'deepseek'
    | 'moonshot',
  DEEPSEEK_API_KEY: optional('DEEPSEEK_API_KEY'),
  DEEPSEEK_BASE_URL: optional('DEEPSEEK_BASE_URL', 'https://api.deepseek.com') ?? 'https://api.deepseek.com',
  DEEPSEEK_MODEL: optional('DEEPSEEK_MODEL', 'deepseek-v4-flash') ?? 'deepseek-v4-flash',
  MOONSHOT_API_KEY: optional('MOONSHOT_API_KEY'),
  MOONSHOT_BASE_URL: optional('MOONSHOT_BASE_URL', 'https://api.moonshot.cn/v1') ?? 'https://api.moonshot.cn/v1',
  MOONSHOT_MODEL: optional('MOONSHOT_MODEL', 'kimi-k2.6') ?? 'kimi-k2.6',

  DATABASE_URL: optional('DATABASE_URL', 'file:./data/app.db') ?? 'file:./data/app.db',
  REDIS_URL: optional('REDIS_URL'),

  SMTP_HOST: optional('SMTP_HOST'),
  SMTP_PORT: int('SMTP_PORT', 587),
  SMTP_USER: optional('SMTP_USER'),
  SMTP_PASS: optional('SMTP_PASS'),
  SMTP_FROM: optional('SMTP_FROM'),

  JWT_SECRET: required(
    'JWT_SECRET',
    'please-change-me-in-production-at-least-32-chars-long',
  ),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d') ?? '7d',

  QUOTA_GENERATE_MONTHLY_FREE: int('QUOTA_GENERATE_MONTHLY_FREE', 20),
  QUOTA_PDF_DAILY_FREE: int('QUOTA_PDF_DAILY_FREE', 10),
  QUOTA_CONFIG_CHAT_DAILY: int('QUOTA_CONFIG_CHAT_DAILY', 60),

  PDF_WORKER_CONCURRENCY: int('PDF_WORKER_CONCURRENCY', 1),
} as const;

export type Env = typeof env;
