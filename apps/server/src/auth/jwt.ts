/**
 * JWT 工具 - 基于 jose
 * httpOnly cookie 下发；7 天有效；剩余 <1 天自动续签
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  plan: 'free' | 'pro';
}

function expiresInToSeconds(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60;
  const n = Number(m[1]);
  const unit = m[2]!;
  return n * (unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400);
}

export async function signSession(payload: Omit<SessionPayload, keyof JWTPayload>): Promise<{
  token: string;
  expiresInMs: number;
}> {
  const seconds = expiresInToSeconds(env.JWT_EXPIRES_IN);
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(secret);
  return { token, expiresInMs: seconds * 1000 };
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** 剩余 <1 天则返回 true，触发续签 */
export function shouldRenew(payload: SessionPayload): boolean {
  if (!payload.exp) return true;
  const remainMs = payload.exp * 1000 - Date.now();
  return remainMs < 24 * 60 * 60 * 1000;
}
