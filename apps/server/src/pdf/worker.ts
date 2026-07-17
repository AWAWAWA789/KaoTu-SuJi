/**
 * PDF Worker - 基于 playwright-core + 无头 Chromium
 * 渲染与浏览器打印同一 HTML 模板（见 print/template.ts）
 *
 * 部署注意：需先 `npx playwright install chromium`
 * 若 Chromium 不可用，抛出明确错误（不静默失败）
 */
import type { LayoutResult } from '@kaotu/shared';
import { renderPrintHtml } from './template.js';

let _browser: any = null;

async function getBrowser(): Promise<any> {
  if (_browser) return _browser;
  let chromium: any;
  try {
    // 优先 playwright-core（更小，需手动装浏览器）
    const pw = await import('playwright-core');
    chromium = (pw as any).chromium;
  } catch {
    // 兜底：完整 playwright 包（动态字符串规避类型检查）
    const mod = 'playwright';
    const pw = await import(/* @vite-ignore */ mod);
    chromium = (pw as any).chromium;
  }
  _browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  return _browser;
}

export async function renderPdf(layout: LayoutResult): Promise<Buffer> {
  const html = renderPrintHtml(layout);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
