/**
 * 生成管线 - LLMProvider 抽象 + OpenAI 兼容实现 + MockProvider + 降级链
 *
 * 链路：deepseek → moonshot → mock
 * 失败任一环节降级到下一个 Provider
 *
 * 长文本规则（指令书 4.2）：
 * - 单文档字符上限 100k
 * - > 12k tokens（按 4 字符 ≈ 1 token 估算，约 48k 字符）按 \n\n 语义边界切块
 * - 重叠 200 字
 * - 块数上限 20
 *
 * 溯源硬闸门：normText.includes(sourceQuote)，不通过的直接丢弃
 */
import {
  CardBatchSchema,
  SYSTEM_PROMPT,
  passesSourceGate,
  type Card,
  type CardBatch,
  type GenerationConfig,
} from '@kaotu/shared';
import type { GenerateInput, GenerateOutput, LLMProvider } from './types.js';

const CHUNK_THRESHOLD_CHARS = 48_000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS = 20;
const MAX_DOC_CHARS = 100_000;

/** OpenAI 兼容协议客户端 */
async function callOpenAICompatible(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM ${opts.model} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]!.message.content;
}

/** 从模型输出中解析卡片 JSON（容错：去除多余文本、修复常见格式问题） */
function parseCards(raw: string): CardBatch {
  // 截取第一个 JSON 对象
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) {
    throw new Error('LLM 输出无 JSON 对象');
  }
  const jsonStr = raw.slice(start, end + 1);
  const obj = JSON.parse(jsonStr);
  return CardBatchSchema.parse(obj);
}

/**
 * 长文本分块 - 按 \n\n 语义边界切块
 */
export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD_CHARS) return [text];
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    if (chunks.length >= MAX_CHUNKS) break;
    const candidate = cur ? cur + '\n\n' + p : p;
    if (candidate.length > CHUNK_THRESHOLD_CHARS) {
      if (cur) {
        chunks.push(cur);
        // 重叠 200 字
        cur = cur.slice(-CHUNK_OVERLAP) + '\n\n' + p;
      } else {
        // 单段超长，硬切
        for (let i = 0; i < p.length; i += CHUNK_THRESHOLD_CHARS) {
          if (chunks.length >= MAX_CHUNKS) break;
          chunks.push(p.slice(i, i + CHUNK_THRESHOLD_CHARS));
        }
        cur = '';
      }
    } else {
      cur = candidate;
    }
  }
  if (cur && chunks.length < MAX_CHUNKS) chunks.push(cur);
  return chunks;
}

/**
 * 构造 user prompt
 */
function buildUserPrompt(sourceText: string, config: GenerationConfig): string {
  return [
    `# 原文`,
    sourceText,
    ``,
    `# 生成配置`,
    `- 卡片形态：${config.cardTypes.join(', ')}`,
    `- 难度：${config.difficulty}`,
    `- 数量上限：${config.count}`,
    ``,
    `请严格按 SYSTEM 指令输出 JSON。`,
  ].join('\n');
}

/**
 * 对一个 chunk 调用 LLM 并解析 + 溯源校验
 */
async function generateForChunk(
  provider: { apiKey: string; baseUrl: string; model: string; name: string },
  sourceText: string,
  config: GenerationConfig,
  chunk: string,
): Promise<{ cards: Card[]; discarded: number }> {
  const raw = await callOpenAICompatible({
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: provider.model,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(chunk, config),
  });
  const parsed = parseCards(raw);
  const accepted: Card[] = [];
  let discarded = 0;
  for (const card of parsed.cards) {
    if (passesSourceGate(card.sourceQuote, sourceText)) {
      accepted.push(card);
    } else {
      discarded += 1;
    }
  }
  return { cards: accepted, discarded };
}

/** DeepSeek Provider */
export class DeepSeekProvider implements LLMProvider {
  name = 'deepseek';
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
  ) {}
  async generateCards(input: GenerateInput): Promise<GenerateOutput> {
    return generateWithOpenAICompatible(this.name, this.apiKey, this.baseUrl, this.model, input);
  }
}

/** Moonshot Provider */
export class MoonshotProvider implements LLMProvider {
  name = 'moonshot';
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
  ) {}
  async generateCards(input: GenerateInput): Promise<GenerateOutput> {
    return generateWithOpenAICompatible(this.name, this.apiKey, this.baseUrl, this.model, input);
  }
}

async function generateWithOpenAICompatible(
  name: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  input: GenerateInput,
): Promise<GenerateOutput> {
  if (input.sourceText.length > MAX_DOC_CHARS) {
    throw new Error(`文档超过字符上限 ${MAX_DOC_CHARS}`);
  }
  const chunks = chunkText(input.sourceText);
  input.onProgress?.('analyzing', 10);
  const allCards: Card[] = [];
  let allDiscarded = 0;
  for (let i = 0; i < chunks.length; i++) {
    input.onProgress?.('extracting', 10 + Math.floor((i / chunks.length) * 30));
    const { cards, discarded } = await generateForChunk(
      { apiKey, baseUrl, model, name },
      input.sourceText,
      input.config,
      chunks[i]!,
    );
    allCards.push(...cards);
    allDiscarded += discarded;
    input.onProgress?.('generating', 40 + Math.floor(((i + 1) / chunks.length) * 55));
    // 截断到配置上限
    if (allCards.length >= input.config.count) {
      allCards.length = input.config.count;
      break;
    }
  }
  input.onProgress?.('generating', 100);
  return { cards: allCards, discarded: allDiscarded, provider: name, chunks: chunks.length };
}

/**
 * MockProvider - 开发零配置可跑
 * 不调用任何外部 API，按原文生成确定性卡片
 */
export class MockProvider implements LLMProvider {
  name = 'mock';
  async generateCards(input: GenerateInput): Promise<GenerateOutput> {
    if (input.sourceText.length > MAX_DOC_CHARS) {
      throw new Error(`文档超过字符上限 ${MAX_DOC_CHARS}`);
    }
    input.onProgress?.('analyzing', 20);

    const text = input.sourceText;
    const sentences = text
      .split(/[。！？!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);

    const want = input.config.count;
    const cards: Card[] = [];
    const types = input.config.cardTypes;
    let discarded = 0;

    for (let i = 0; i < sentences.length && cards.length < want; i++) {
      const s = sentences[i]!;
      // mock 也走溯源闸门：sourceQuote 必须是原文子串
      const isSub = passesSourceGate(s, text);
      if (!isSub) {
        discarded += 1;
        continue;
      }
      const type = types[i % types.length]!;
      if (type === 'qa') {
        cards.push({
          type: 'qa',
          sourceQuote: s,
          payload: {
            type: 'qa',
            question: `关于这段话，关键要点是什么？（第 ${i + 1} 句）`,
            answer: s,
          },
          tags: ['mock'],
        });
      } else if (type === 'cloze') {
        // 选最长 token 作为空格
        const tokens = s.split(/[\s,，、。：；]+/).filter((t) => t.length >= 2);
        const token = tokens.sort((a, b) => b.length - a.length)[0] ?? s.slice(0, 2);
        const clozeText = s.replace(token, '___');
        if (!clozeText.includes('___')) {
          // 兜底：取前两字
          const t2 = s.slice(0, 2);
          cards.push({
            type: 'cloze',
            sourceQuote: s,
            payload: {
              type: 'cloze',
              text: s.replace(t2, '___'),
              blanks: [{ token: t2 }],
            },
            tags: ['mock'],
          });
        } else {
          cards.push({
            type: 'cloze',
            sourceQuote: s,
            payload: { type: 'cloze', text: clozeText, blanks: [{ token }] },
            tags: ['mock'],
          });
        }
      } else {
        // mindmap
        cards.push({
          type: 'mindmap',
          sourceQuote: s,
          payload: {
            type: 'mindmap',
            root: {
              text: s.slice(0, 16),
              children: [
                { text: '要点 1' },
                { text: '要点 2', children: [{ text: '子要点' }] },
              ],
            },
          },
          tags: ['mock'],
        });
      }
      // 模拟进度
      input.onProgress?.('generating', 20 + Math.floor((cards.length / want) * 80));
      // 让出事件循环
      await new Promise((r) => setTimeout(r, 5));
    }
    input.onProgress?.('generating', 100);
    return { cards, discarded, provider: 'mock', chunks: 1 };
  }
}

/**
 * 降级链 - deepseek → moonshot → mock
 */
export class FallbackChain implements LLMProvider {
  name = 'fallback';
  private providers: LLMProvider[];
  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) throw new Error('FallbackChain needs at least 1 provider');
    this.providers = providers;
  }
  async generateCards(input: GenerateInput): Promise<GenerateOutput> {
    let lastErr: unknown = null;
    for (const p of this.providers) {
      try {
        const out = await p.generateCards(input);
        out.provider = `${p.name}${p === this.providers[0] ? '' : `(fallback from ${lastErr ? 'error' : ''})`}`;
        return out;
      } catch (e) {
        lastErr = e;
        console.warn(`[ai] provider ${p.name} failed, falling back. error=`, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('All providers failed');
  }
}

/**
 * 工厂：根据 env 构造降级链
 */
export function buildProviderChain(opts: {
  llmProvider: 'mock' | 'deepseek' | 'moonshot';
  deepseekApiKey?: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  moonshotApiKey?: string;
  moonshotBaseUrl: string;
  moonshotModel: string;
}): LLMProvider {
  const mock = new MockProvider();
  const chain: LLMProvider[] = [];

  if (opts.llmProvider === 'deepseek' && opts.deepseekApiKey) {
    chain.push(
      new DeepSeekProvider(opts.deepseekApiKey, opts.deepseekBaseUrl, opts.deepseekModel),
    );
    if (opts.moonshotApiKey) {
      chain.push(
        new MoonshotProvider(opts.moonshotApiKey, opts.moonshotBaseUrl, opts.moonshotModel),
      );
    }
    chain.push(mock);
    return new FallbackChain(chain);
  }
  if (opts.llmProvider === 'moonshot' && opts.moonshotApiKey) {
    chain.push(
      new MoonshotProvider(opts.moonshotApiKey, opts.moonshotBaseUrl, opts.moonshotModel),
    );
    chain.push(mock);
    return new FallbackChain(chain);
  }
  // 默认 mock
  return mock;
}
