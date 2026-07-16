/**
 * 生成管线核心测试：分块 + 溯源闸门 + Mock 生成
 */
import { describe, it, expect } from 'vitest';
import {
  chunkText,
  MockProvider,
  DeepSeekProvider,
  MoonshotProvider,
  FallbackChain,
} from './generate.js';
import {
  passesSourceGate,
  normalizeText,
  CardBatchSchema,
  type GenerationConfig,
} from '@kaotu/shared';
import type { GenerateInput, GenerateOutput, LLMProvider } from './types.js';

const config: GenerationConfig = {
  cardTypes: ['qa', 'cloze', 'mindmap'],
  difficulty: 'medium',
  density: 8,
  count: 5,
};

describe('passesSourceGate', () => {
  it('原文子串通过', () => {
    expect(passesSourceGate('TCP 三次握手', 'TCP 三次握手是建立连接的过程')).toBe(true);
  });
  it('非子串不通过', () => {
    expect(passesSourceGate('UDP 协议', 'TCP 三次握手')).toBe(false);
  });
  it('空白容差', () => {
    expect(passesSourceGate('TCP  三次握手', 'TCP 三次握手')).toBe(true);
  });
  it('空字符串不通过', () => {
    expect(passesSourceGate('', '原文')).toBe(false);
    expect(passesSourceGate('原文', '')).toBe(false);
  });
});

describe('normalizeText', () => {
  it('去除首尾空白', () => {
    expect(normalizeText('  abc  ')).toBe('abc');
  });
  it('合并多空白', () => {
    expect(normalizeText('a   b\n\nc')).toBe('a b c');
  });
});

describe('chunkText', () => {
  it('短文本不切块', () => {
    const chunks = chunkText('短文本');
    expect(chunks).toHaveLength(1);
  });

  it('超长文本按段落切块', () => {
    // 每段 200 字符，1000 段 ≈ 200k 字符，超过阈值 48k
    const long = Array.from({ length: 1000 }, (_, i) =>
      `段落 ${i} ${'内容'.repeat(50)}。`,
    ).join('\n\n');
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(20);
  });

  it('块数上限 20', () => {
    const huge = Array.from({ length: 100 }, (_, i) =>
      'x'.repeat(50_000),
    ).join('\n\n');
    const chunks = chunkText(huge);
    expect(chunks.length).toBeLessThanOrEqual(20);
  });

  it('单段超长硬切', () => {
    const oneHuge = 'x'.repeat(150_000);
    const chunks = chunkText(oneHuge);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('MockProvider', () => {
  it('生成卡片并通过溯源闸门', async () => {
    const provider = new MockProvider();
    const input: GenerateInput = {
      sourceText: 'TCP 三次握手是建立可靠连接的过程。第一步客户端发送 SYN。第二步服务端回复 SYN-ACK。第三步客户端发送 ACK 完成连接。',
      config,
    };
    const out = await provider.generateCards(input);
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.provider).toBe('mock');
    for (const c of out.cards) {
      expect(passesSourceGate(c.sourceQuote, input.sourceText)).toBe(true);
    }
  });

  it('超长文档抛错', async () => {
    const provider = new MockProvider();
    const input: GenerateInput = {
      sourceText: 'x'.repeat(100_001),
      config,
    };
    await expect(provider.generateCards(input)).rejects.toThrow();
  });

  it('触发 onProgress 回调', async () => {
    const provider = new MockProvider();
    const stages: string[] = [];
    const input: GenerateInput = {
      sourceText: '一段文本内容。第二句话。第三句话。第四句话。第五句话。',
      config: { ...config, count: 3 },
      onProgress: (stage) => stages.push(stage),
    };
    await provider.generateCards(input);
    expect(stages).toContain('analyzing');
    expect(stages).toContain('generating');
  });

  it('生成的卡片通过 CardBatchSchema 校验', async () => {
    const provider = new MockProvider();
    const input: GenerateInput = {
      sourceText: '一段文本内容。第二句话。第三句话。第四句话。第五句话。',
      config: { ...config, count: 3 },
    };
    const out = await provider.generateCards(input);
    const parsed = CardBatchSchema.safeParse({ cards: out.cards });
    expect(parsed.success).toBe(true);
  });

  it('生成指定数量的卡片（不超过上限）', async () => {
    const provider = new MockProvider();
    const input: GenerateInput = {
      sourceText: Array.from({ length: 20 }, (_, i) => `第 ${i} 句话内容较长。`).join(' '),
      config: { ...config, count: 7 },
    };
    const out = await provider.generateCards(input);
    expect(out.cards.length).toBeLessThanOrEqual(7);
  });
});

describe('DeepSeekProvider / MoonshotProvider', () => {
  it('构造时不抛错', () => {
    expect(() => new DeepSeekProvider('k', 'https://api.deepseek.com', 'm')).not.toThrow();
    expect(() => new MoonshotProvider('k', 'https://api.moonshot.cn/v1', 'm')).not.toThrow();
  });
});

describe('FallbackChain', () => {
  it('第一个 Provider 成功则用第一个', async () => {
    const ok: LLMProvider = {
      name: 'ok',
      async generateCards(input) {
        return { cards: [], discarded: 0, provider: 'ok' };
      },
    };
    const chain = new FallbackChain([ok]);
    const out = await chain.generateCards({ sourceText: 'x', config });
    expect(out.provider).toContain('ok');
  });

  it('第一个失败降级到第二个', async () => {
    const fail: LLMProvider = {
      name: 'fail',
      async generateCards() {
        throw new Error('boom');
      },
    };
    const ok: LLMProvider = {
      name: 'ok',
      async generateCards() {
        return { cards: [], discarded: 0, provider: 'ok' };
      },
    };
    const chain = new FallbackChain([fail, ok]);
    const out = await chain.generateCards({ sourceText: 'x', config });
    expect(out.provider).toContain('ok');
  });

  it('全部失败则抛出最后一个错误', async () => {
    const fail1: LLMProvider = {
      name: 'fail1',
      async generateCards() {
        throw new Error('first');
      },
    };
    const fail2: LLMProvider = {
      name: 'fail2',
      async generateCards() {
        throw new Error('second');
      },
    };
    const chain = new FallbackChain([fail1, fail2]);
    await expect(chain.generateCards({ sourceText: 'x', config })).rejects.toThrow('second');
  });

  it('空数组构造抛错', () => {
    expect(() => new FallbackChain([])).toThrow();
  });

  it('生成 output 包含 provider 字段', async () => {
    const ok: LLMProvider = {
      name: 'ok',
      async generateCards() {
        const out: GenerateOutput = { cards: [], discarded: 0, provider: 'ok' };
        return out;
      },
    };
    const chain = new FallbackChain([ok]);
    const out = await chain.generateCards({ sourceText: 'x', config });
    expect(out.provider).toBeTruthy();
  });
});
