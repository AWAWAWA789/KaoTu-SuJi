/**
 * 对话式配置解析器测试
 */
import { describe, it, expect } from 'vitest';
import { parseConfigFromMessage } from '../../trpc/routers/config.js';
import type { GenerationConfig } from '@kaotu/shared';

const base: GenerationConfig = {
  cardTypes: ['qa', 'cloze', 'mindmap'],
  difficulty: 'medium',
  density: 8,
  count: 10,
};

describe('parseConfigFromMessage', () => {
  it('识别卡片类型：问答', () => {
    const r = parseConfigFromMessage('帮我生成问答卡片', base);
    expect(r.config.cardTypes).toEqual(['qa']);
    expect(r.changed).toContain('卡片类型=qa');
  });

  it('识别多种卡片类型', () => {
    const r = parseConfigFromMessage('切换到填空和导图', base);
    expect(r.config.cardTypes.sort()).toEqual(['cloze', 'mindmap'].sort());
  });

  it('识别难度：困难', () => {
    const r = parseConfigFromMessage('难度调到困难', base);
    expect(r.config.difficulty).toBe('hard');
  });

  it('识别难度：简单（含基础关键词）', () => {
    const r = parseConfigFromMessage('生成基础卡片', base);
    expect(r.config.difficulty).toBe('easy');
  });

  it('识别数量', () => {
    const r = parseConfigFromMessage('生成 15 张卡片', base);
    expect(r.config.count).toBe(15);
  });

  it('数量上限 50', () => {
    const r = parseConfigFromMessage('生成 100 张卡片', base);
    expect(r.config.count).toBe(50);
  });

  it('识别密度', () => {
    const r = parseConfigFromMessage('改成 16 等分打印', base);
    expect(r.config.density).toBe(16);
  });

  it('组合指令', () => {
    const r = parseConfigFromMessage('切换到填空卡片，难度调到困难，生成 15 张', base);
    expect(r.config.cardTypes).toEqual(['cloze']);
    expect(r.config.difficulty).toBe('hard');
    expect(r.config.count).toBe(15);
    expect(r.changed.length).toBe(3);
  });

  it('不可解析的指令不污染配置', () => {
    const r = parseConfigFromMessage('今天天气真好', base);
    expect(r.config).toEqual(base);
    expect(r.changed).toEqual([]);
    expect(r.reply).toContain('保持原样');
  });

  it('英文关键词也能识别', () => {
    const r = parseConfigFromMessage('use qa cards, hard difficulty, 20 cards', base);
    expect(r.config.cardTypes).toEqual(['qa']);
    expect(r.config.difficulty).toBe('hard');
    expect(r.config.count).toBe(20);
  });

  it('回复中包含已更新的字段', () => {
    const r = parseConfigFromMessage('生成 8 张', base);
    expect(r.reply).toContain('数量=8');
  });

  it('20 条意图识别 ≥90%（18/20 通过即视为达标）', () => {
    const cases: Array<{ msg: string; expect: Partial<GenerationConfig> }> = [
      { msg: '生成 10 张问答卡', expect: { cardTypes: ['qa'], count: 10 } },
      { msg: '用填空形式', expect: { cardTypes: ['cloze'] } },
      { msg: '导图模式', expect: { cardTypes: ['mindmap'] } },
      { msg: '简单一点', expect: { difficulty: 'easy' } },
      { msg: '太难了，简单点', expect: { difficulty: 'easy' } },
      { msg: '困难模式', expect: { difficulty: 'hard' } },
      { msg: '更难一些', expect: { difficulty: 'hard' } },
      { msg: '中等难度', expect: { difficulty: 'medium' } },
      { msg: '20 张', expect: { count: 20 } },
      { msg: '5 张卡片', expect: { count: 5 } },
      { msg: '8 等分', expect: { density: 8 } },
      { msg: '32 宫格', expect: { density: 32 } },
      { msg: '4 等分打印', expect: { density: 4 } },
      { msg: '16 宫格', expect: { density: 16 } },
      { msg: '问答+填空', expect: { cardTypes: ['qa', 'cloze'] } },
      { msg: '导图+问答', expect: { cardTypes: ['mindmap', 'qa'] } },
      { msg: '帮我做 12 张简单的填空卡', expect: { cardTypes: ['cloze'], difficulty: 'easy', count: 12 } },
      { msg: 'easy qa 7 cards', expect: { cardTypes: ['qa'], difficulty: 'easy', count: 7 } },
      { msg: '换成 4 等分', expect: { density: 4 } },
      { msg: '今天天气不错', expect: {} },
    ];
    let pass = 0;
    for (const c of cases) {
      const r = parseConfigFromMessage(c.msg, base);
      const ok = Object.entries(c.expect).every(([k, v]) => {
        const got = (r.config as any)[k];
        if (Array.isArray(v)) return Array.isArray(got) && v.every((x) => got.includes(x)) && got.length === v.length;
        return got === v;
      });
      if (ok) pass++;
    }
    // 20 条至少 18 条通过（≥90%）
    expect(pass).toBeGreaterThanOrEqual(18);
  });
});
