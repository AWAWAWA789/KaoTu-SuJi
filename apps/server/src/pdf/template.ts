/**
 * 打印 HTML 模板 - 浏览器打印与 PDF 导出共用
 *
 * 设计：
 * - @page A4 + margin
 * - 每页一个 .page，内部 grid 等分
 * - 每格独立 .slot，内含 .front + .back，字号由 layoutResult 决定
 * - 仅打印卡片区域（隐藏其他元素由前端控制）
 */
import type { LayoutResult } from '@kaotu/shared';
import { DENSITIES, slotSizeMm } from '@kaotu/shared/print';
import { escapeHtml } from './escape.js';

export function renderPrintHtml(layout: LayoutResult): string {
  const { pages, density } = layout;
  const { w, h } = slotSizeMm(density);
  const cols =
    density === '4' ? 2 : density === '8' ? 2 : density === '16' ? 4 : 4;

  const pagesHtml = pages
    .map((page) => {
      const slotsHtml = page.slots
        .map((s) => {
          return `<div class="slot" style="width:${w}mm;height:${h}mm;font-size:${s.fontSize}pt">
  <div class="front">${escapeHtml(s.front)}</div>
  <div class="back">${escapeHtml(s.back)}</div>
</div>`;
        })
        .join('\n');
      return `<section class="page" style="grid-template-columns:repeat(${cols},1fr)">${slotsHtml}</section>`;
    })
    .join('\n');

  const warningsHtml = layout.warnings.length
    ? `<div class="warnings">${layout.warnings.map((w) => `<p>⚠ ${escapeHtml(w)}</p>`).join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>考途速记打印</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .page {
    display: grid;
    gap: 0;
    page-break-after: always;
    width: 190mm;
    height: 277mm;
  }
  .page:last-child { page-break-after: auto; }
  .slot {
    border: 0.5px solid #888;
    padding: 2mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .front { font-weight: 600; color: #000; }
  .back { color: #444; margin-top: 1mm; border-top: 0.5px dashed #bbb; padding-top: 1mm; }
  .warnings { padding: 4mm; color: #b91c1c; }
  @media print { .warnings { display: none; } }
</style>
</head>
<body>
${warningsHtml}
${pagesHtml}
</body>
</html>`;
}

// 占位引用避免 unused
void DENSITIES;
