/**
 * A4 多等分排版引擎 - 前后端共用的纯函数
 *
 * 规则（指令书 4.4 / F2）：
 * - 4/8/16/32 等分切换
 * - 全局字号二分搜索：在 [MIN_FONT_SIZE, MAX_FONT_SIZE] 之间寻找最大不溢出字号
 * - 溢出标记：若最小字号仍溢出 → overflowed=true
 * - 降密度建议：溢出时计算"建议密度"（通常是当前密度 / 2）
 * - 多页警告：pages > 1 时追加 warning
 * - 绝不静默截断：所有卡片必须完整排版
 *
 * 测量模型：基于字符数的近似测量（前端可用 DOM 实测，后端用此纯函数）
 * 这里实现一个确定性的纯函数版本，覆盖率目标 ≥95%
 */
import type { LayoutInput, LayoutResult, Density } from '../contracts/print.js';

export const DENSITIES: Density[] = ['4', '8', '16', '32'];

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_MARGIN_MM = 10;

// 等分后的单格尺寸（毫米，已扣除边距）
export function slotSizeMm(density: Density): { w: number; h: number } {
  const usableW = A4_WIDTH_MM - 2 * A4_MARGIN_MM;
  const usableH = A4_HEIGHT_MM - 2 * A4_MARGIN_MM;
  // 计算列数：4=2x2, 8=2x4, 16=4x4, 32=4x8
  const cols =
    density === '4' ? 2 : density === '8' ? 2 : density === '16' ? 4 : 4;
  const rows =
    density === '4'
      ? 2
      : density === '8'
        ? 4
        : density === '16'
          ? 4
          : 8;
  return {
    w: usableW / cols,
    h: usableH / rows,
  };
}

export const MIN_FONT_SIZE = 6; // pt
export const MAX_FONT_SIZE = 14; // pt

/**
 * 估算给定字号下，文本在指定宽度内占用的行高总和（毫米）
 *
 * 简化模型：
 * - 字号 pt → 字符宽度 ≈ fontSize * 0.5 mm（中文等宽近似）
 * - 每行可容纳字符数 = floor(slotWidthMm / charWidthMm)
 * - 行数 = ceil(textLength / charsPerLine)
 * - 行高 = fontSize * 1.4 pt → mm (1pt = 0.3528mm)
 * - 总高度 = 行数 * lineHeightMm
 */
export function estimateTextHeightMm(
  text: string,
  fontSize: number,
  slotWidthMm: number,
): number {
  if (!text) return 0;
  const charWidthMm = fontSize * 0.5;
  const charsPerLine = Math.max(1, Math.floor(slotWidthMm / charWidthMm));
  // 按显式换行分段
  const lines = text.split('\n');
  let totalLines = 0;
  for (const line of lines) {
    if (line.length === 0) {
      totalLines += 1;
    } else {
      totalLines += Math.ceil(line.length / charsPerLine);
    }
  }
  const lineHeightMm = fontSize * 1.4 * 0.3528;
  return totalLines * lineHeightMm;
}

/**
 * 单格是否能容纳（front + back + 分隔间距）
 */
function slotFits(
  front: string,
  back: string,
  fontSize: number,
  slotW: number,
  slotH: number,
): boolean {
  const paddingMm = 2 * 2; // 上下内边距
  const gapMm = 3; // front 与 back 之间
  const frontH = estimateTextHeightMm(front, fontSize, slotW - 2);
  const backH = estimateTextHeightMm(back, fontSize, slotW - 2);
  return frontH + backH + gapMm + paddingMm <= slotH;
}

/**
 * 二分搜索：寻找最大不溢出字号
 */
export function binarySearchFontSize(
  front: string,
  back: string,
  slotW: number,
  slotH: number,
): { fontSize: number; fits: boolean } {
  let lo = MIN_FONT_SIZE;
  let hi = MAX_FONT_SIZE;
  let best = MIN_FONT_SIZE;
  let bestFits = slotFits(front, back, MIN_FONT_SIZE, slotW, slotH);

  // 二分精度 0.5pt
  for (let i = 0; i < 20; i++) {
    const mid = Number(((lo + hi) / 2).toFixed(1));
    if (mid <= lo) break;
    const fits = slotFits(front, back, mid, slotW, slotH);
    if (fits) {
      best = mid;
      bestFits = true;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { fontSize: best, fits: bestFits };
}

/**
 * 建议降密度：找到第一个能容纳所有卡片的更小密度
 */
function suggestLowerDensity(
  cards: LayoutInput['cards'],
  current: Density,
): Density | null {
  const idx = DENSITIES.indexOf(current);
  for (let i = idx - 1; i >= 0; i--) {
    const d = DENSITIES[i]!;
    const { w, h } = slotSizeMm(d);
    const allFit = cards.every((c) => {
      const r = binarySearchFontSize(c.front, c.back, w, h);
      return r.fits;
    });
    if (allFit) return d;
  }
  return null;
}

/**
 * 主入口：排版计算
 */
export function layout(input: LayoutInput): LayoutResult {
  const { cards, density } = input;
  const { w: slotW, h: slotH } = slotSizeMm(density);
  const slotsPerPage = Number(density);

  // 1. 计算每张卡片的字号 & 是否溢出
  const perCard = cards.map((c) => {
    const r = binarySearchFontSize(c.front, c.back, slotW, slotH);
    return { ...c, fontSize: r.fontSize, fits: r.fits };
  });

  const overflowed = perCard.some((c) => !c.fits);
  const warnings: string[] = [];

  if (overflowed) {
    warnings.push(
      `当前 ${density} 等分下有 ${perCard.filter((c) => !c.fits).length} 张卡片即使最小字号仍溢出，请降低密度或拆分卡片组`,
    );
  }

  // 2. 分页
  const pages: LayoutResult['pages'] = [];
  for (let i = 0; i < perCard.length; i += slotsPerPage) {
    const slice = perCard.slice(i, i + slotsPerPage);
    pages.push({
      index: pages.length,
      slots: slice.map((c) => ({
        cardId: c.cardId,
        type: c.type,
        front: c.front,
        back: c.back,
        fontSize: c.fontSize,
      })),
    });
  }

  if (pages.length > 1) {
    warnings.push(`当前共 ${pages.length} 页 A4，建议确认打印份数`);
  }

  if (cards.length === 0) {
    warnings.push('没有可排版的卡片');
  }

  // 3. 降密度建议（仅在溢出时）
  const suggestedDensity = overflowed ? suggestLowerDensity(cards, density) : null;
  if (overflowed && suggestedDensity) {
    warnings.push(`建议降为 ${suggestedDensity} 等分以避免溢出`);
  } else if (overflowed) {
    warnings.push('已无法通过降密度解决溢出，请减少卡片数量或缩短卡片内容');
  }

  return {
    pages,
    density,
    overflowed,
    suggestedDensity,
    warnings,
  };
}
