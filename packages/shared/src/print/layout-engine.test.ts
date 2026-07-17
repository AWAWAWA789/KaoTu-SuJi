import { describe, it, expect } from 'vitest';
import {
  layout,
  slotSizeMm,
  estimateTextHeightMm,
  binarySearchFontSize,
  DENSITIES,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
} from './layout-engine.js';
import type { LayoutInput } from '../contracts/print.js';

function makeCard(
  cardId: string,
  front: string,
  back: string,
): LayoutInput['cards'][number] {
  return { cardId, type: 'qa', front, back };
}

describe('slotSizeMm', () => {
  it('4 等分 = 2x2', () => {
    const s = slotSizeMm('4');
    expect(s.w).toBeCloseTo((A4_WIDTH_MM - 20) / 2, 1);
    expect(s.h).toBeCloseTo((A4_HEIGHT_MM - 20) / 2, 1);
  });
  it('8 等分 = 2x4', () => {
    const s = slotSizeMm('8');
    expect(s.w).toBeCloseTo((A4_WIDTH_MM - 20) / 2, 1);
    expect(s.h).toBeCloseTo((A4_HEIGHT_MM - 20) / 4, 1);
  });
  it('16 等分 = 4x4', () => {
    const s = slotSizeMm('16');
    expect(s.w).toBeCloseTo((A4_WIDTH_MM - 20) / 4, 1);
    expect(s.h).toBeCloseTo((A4_HEIGHT_MM - 20) / 4, 1);
  });
  it('32 等分 = 4x8', () => {
    const s = slotSizeMm('32');
    expect(s.w).toBeCloseTo((A4_WIDTH_MM - 20) / 4, 1);
    expect(s.h).toBeCloseTo((A4_HEIGHT_MM - 20) / 8, 1);
  });
  it('密度越高格子越小', () => {
    const s4 = slotSizeMm('4');
    const s32 = slotSizeMm('32');
    expect(s32.w).toBeLessThan(s4.w);
    expect(s32.h).toBeLessThan(s4.h);
  });
});

describe('estimateTextHeightMm', () => {
  it('空文本返回 0', () => {
    expect(estimateTextHeightMm('', 12, 80)).toBe(0);
  });
  it('单行短文本', () => {
    const h = estimateTextHeightMm('hello', 12, 80);
    expect(h).toBeGreaterThan(0);
  });
  it('长文本自动换行增加高度', () => {
    const short = estimateTextHeightMm('短', 12, 80);
    const long = estimateTextHeightMm('这是一段非常长的文本'.repeat(20), 12, 80);
    expect(long).toBeGreaterThan(short);
  });
  it('显式换行被计入', () => {
    const oneLine = estimateTextHeightMm('a', 12, 80);
    const twoLines = estimateTextHeightMm('a\nb', 12, 80);
    expect(twoLines).toBeGreaterThan(oneLine);
  });
});

describe('binarySearchFontSize', () => {
  it('短文本应能找到最大字号', () => {
    const r = binarySearchFontSize('问', '答', 80, 50);
    expect(r.fits).toBe(true);
    expect(r.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  });
  it('超长文本可能不 fit', () => {
    const r = binarySearchFontSize('x'.repeat(500), 'y'.repeat(500), 50, 10);
    expect(r.fits).toBe(false);
  });
  it('字号范围合法', () => {
    const r = binarySearchFontSize('test', 'test', 80, 60);
    expect(r.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(r.fontSize).toBeLessThanOrEqual(MAX_FONT_SIZE);
  });
});

describe('layout - 基本行为', () => {
  it('空卡片列表产出空页面与警告', () => {
    const r = layout({ cards: [], density: '8' });
    expect(r.pages).toHaveLength(0);
    expect(r.overflowed).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('卡片数 <= 密度 → 单页', () => {
    const r = layout({
      cards: [makeCard('1', '问1', '答1'), makeCard('2', '问2', '答2')],
      density: '4',
    });
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]!.slots).toHaveLength(2);
  });

  it('卡片数 > 密度 → 多页 + 警告', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      makeCard(String(i), `问${i}`, `答${i}`),
    );
    const r = layout({ cards, density: '4' });
    expect(r.pages.length).toBeGreaterThan(1);
    expect(r.warnings.some((w) => w.includes('页'))).toBe(true);
  });

  it('所有卡片必须完整出现在 pages 中（无静默截断）', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard(String(i), `问${i}`, `答${i}`),
    );
    const r = layout({ cards, density: '8' });
    const allIds = r.pages.flatMap((p) => p.slots.map((s) => s.cardId));
    expect(allIds).toEqual(cards.map((c) => c.cardId));
  });
});

describe('layout - 溢出治理', () => {
  it('所有密度均溢出时 overflowed=true 且 suggestedDensity=null', () => {
    const cards = [
      makeCard(
        '1',
        '超长'.repeat(500),
        '更超长'.repeat(500),
      ),
    ];
    const r = layout({ cards, density: '32' });
    expect(r.overflowed).toBe(true);
    expect(r.suggestedDensity).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('高密度溢出时建议降密度', () => {
    // 32 等分单格很小，长文本会溢出；4 等分能容纳
    const longText = '问题内容'.repeat(20);
    const longBack = '答案内容'.repeat(20);
    const cards = [makeCard('1', longText, longBack)];
    const r = layout({ cards, density: '32' });
    if (r.overflowed) {
      // 应该给出建议（若 4 等分能容下）
      const r4 = layout({ cards, density: '4' });
      if (!r4.overflowed) {
        expect(r.suggestedDensity).not.toBeNull();
      }
    }
  });

  it('不溢出时 suggestedDensity=null', () => {
    const r = layout({
      cards: [makeCard('1', '问', '答')],
      density: '4',
    });
    expect(r.overflowed).toBe(false);
    expect(r.suggestedDensity).toBeNull();
  });
});

describe('layout - 四种密度', () => {
  it('DENSITIES 包含 4/8/16/32', () => {
    expect(DENSITIES).toEqual(['4', '8', '16', '32']);
  });

  it('每种密度都能正常排版', () => {
    for (const d of DENSITIES) {
      const r = layout({
        cards: [makeCard('1', '问', '答')],
        density: d,
      });
      expect(r.density).toBe(d);
      expect(r.pages[0]!.slots[0]!.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    }
  });
});

describe('layout - 20 组真实长度卡片', () => {
  it('四种密度零静默截断', () => {
    const samples = [
      { f: '什么是 OSI 七层模型？', b: '物理层、数据链路层、网络层、传输层、会话层、表示层、应用层' },
      { f: 'TCP 三次握手', b: 'SYN, SYN-ACK, ACK' },
      { f: '解释牛顿第二定律', b: 'F = ma，物体加速度与所受合外力成正比，与质量成反比' },
      { f: '什么是光合作用？', b: '绿色植物利用光能将二氧化碳和水转化为有机物并释放氧气的过程' },
      { f: 'DNA 双螺旋结构', b: '由两条反向平行的多核苷酸链围绕同一中心轴盘绕而成' },
      { f: '什么是需求弹性？', b: '商品需求量对价格变化的敏感程度' },
      { f: 'C 语言指针', b: '存储变量地址的变量' },
      { f: '什么是复利？', b: '利息加入本金后再次计息，即利滚利' },
      { f: '化学反应平衡常数', b: '可逆反应达到平衡时产物浓度乘积与反应物浓度乘积之比' },
      { f: '什么是市场经济？', b: '通过价格机制和供求关系配置资源的经济体制' },
      { f: '解释熵增定律', b: '孤立系统的熵总是趋向于增大，热力学第二定律' },
      { f: '什么是认知失调？', b: '个体持有相互矛盾信念时产生的心理不适状态' },
      { f: 'HTTP 状态码 404', b: 'Not Found，请求的资源不存在' },
      { f: '什么是马太效应？', b: '强者愈强、弱者愈弱的社会现象' },
      { f: '解释边际效用递减', b: '连续消费同种商品时，每多消费一单位带来的效用逐步减少' },
      { f: '什么是基因突变？', b: 'DNA 序列发生可遗传的永久性改变' },
      { f: '什么是机会成本？', b: '为得到某种东西而放弃的其他选择中价值最大的那个' },
      { f: '什么是黑洞？', b: '引力极强以至于光也无法逃逸的天体' },
      { f: '什么是 Nash 均衡？', b: '博弈中任一玩家单方面改变策略都不会获益的状态' },
      { f: '什么是通货膨胀？', b: '流通中货币量超过实际需要引起的货币贬值、物价上涨' },
    ];

    for (const d of DENSITIES) {
      const cards = samples.map((s, i) =>
        makeCard(String(i), s.f, s.b),
      );
      const r = layout({ cards, density: d });
      // 所有卡片必须出现在 pages 中
      const ids = r.pages.flatMap((p) => p.slots.map((s) => s.cardId));
      expect(ids).toHaveLength(samples.length);
      expect(new Set(ids).size).toBe(samples.length);
    }
  });
});
