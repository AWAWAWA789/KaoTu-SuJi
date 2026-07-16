/**
 * 邮件发送 - 无 SMTP 时降级为打日志
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER) {
    return null;
  }
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return _transporter;
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // 降级：打日志（开发模式可见）
    console.log(`[auth] login code (no SMTP) -> email=${email} code=${code}`);
    return;
  }
  await t.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: email,
    subject: '【考途速记】登录验证码',
    text: `你的登录验证码是：${code}\n该验证码 5 分钟内有效。如非本人操作请忽略。`,
    html: `<p>你的登录验证码是：</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>该验证码 5 分钟内有效。如非本人操作请忽略。</p>`,
  });
}
