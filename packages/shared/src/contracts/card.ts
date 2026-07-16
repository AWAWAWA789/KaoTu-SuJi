/**
 * 卡片契约 - 前后端共享，单一真实来源
 *
 * 三种卡片形态：qa（问答式）、cloze（填空式）、mindmap（导图式）
 * 溯源硬闸门：normText.includes(sourceQuote) 必须成立
 */
import { z } from 'zod';

/** 卡片形态枚举 */
export const CardTypeEnum = z.enum(['qa', 'cloze', 'mindmap']);
export type CardType = z.infer<typeof CardTypeEnum>;

/** 难度枚举（生成时） */
export const DifficultyEnum = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof DifficultyEnum>;

/** 问答式卡片 */
export const QAPayloadSchema = z.object({
  type: z.literal('qa'),
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});

/** 填空式卡片：原句中关键术语用 ___ 隐去 */
export const ClozePayloadSchema = z.object({
  type: z.literal('cloze'),
  text: z.string().min(1).max(2000),
  blanks: z
    .array(
      z.object({
        token: z.string().min(1).max(100),
        hint: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/** 导图式卡片：树状文本（├─ └─） */
export const MindMapNodeSchema: z.ZodType<{
  text: string;
  children?: MindMapNode[];
}> = z.lazy(() =>
  z.object({
    text: z.string().min(1).max(200),
    children: z.array(MindMapNodeSchema).optional(),
  }),
);
export type MindMapNode = z.infer<typeof MindMapNodeSchema>;

export const MindMapPayloadSchema = z.object({
  type: z.literal('mindmap'),
  root: MindMapNodeSchema,
});

/** 卡片 payload 联合类型 */
export const CardPayloadSchema = z.discriminatedUnion('type', [
  QAPayloadSchema,
  ClozePayloadSchema,
  MindMapPayloadSchema,
]);
export type CardPayload = z.infer<typeof CardPayloadSchema>;

/** 单张卡片 schema */
export const CardSchema = z.object({
  type: CardTypeEnum,
  sourceQuote: z.string().min(1).max(1000).describe('必须为 source 文本的子串'),
  payload: CardPayloadSchema,
  tags: z.array(z.string().max(50)).max(10).default([]),
});
export type Card = z.infer<typeof CardSchema>;

/** 批量卡片 schema（LLM 输出格式） */
export const CardBatchSchema = z.object({
  cards: z.array(CardSchema).min(1).max(50),
});
export type CardBatch = z.infer<typeof CardBatchSchema>;

/** 生成配置（对话式配置工具同构） */
export const GenerationConfigSchema = z.object({
  cardTypes: z.array(CardTypeEnum).min(1).max(3),
  difficulty: DifficultyEnum.default('medium'),
  density: z.number().int().min(4).max(32).default(8).describe('A4 等分数'),
  count: z.number().int().min(1).max(50).default(10),
});
export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;

/**
 * LLM System Prompt - 强约束输出格式
 */
export const SYSTEM_PROMPT = `你是一名记忆卡片生成专家。基于用户提供的教材原文，严格按以下规则生成卡片：

# 输出格式（必须是合法 JSON）
{
  "cards": [
    {
      "type": "qa" | "cloze" | "mindmap",
      "sourceQuote": "原文中的连续子串（用于溯源校验）",
      "payload": { ... },
      "tags": ["标签"]
    }
  ]
}

# 卡片形态
1. qa：question + answer 字段
2. cloze：text（用 ___ 占位关键术语）+ blanks（[{token, hint?}]）
3. mindmap：root（{text, children?} 树状结构）

# 硬性约束（违反即丢弃）
- sourceQuote 必须是原文的连续子串，禁止改写、概括、补充
- 难度由配置决定：easy=核心定义、medium=关键概念、hard=综合辨析
- 数量不超过配置上限
- 每张卡片必须独立可复习，避免重复

# 难度对应
- easy：基础定义类问答/填空
- medium：概念辨析、原理阐述
- hard：对比、推理、综合应用

只输出 JSON，不要任何解释文字。`;

/**
 * 对话式配置 - Function Calling 工具定义
 */
export const UPDATE_CARD_CONFIG_TOOL = {
  name: 'updateCardConfig',
  description: '根据用户自然语言指令更新卡片生成配置。无法解析的参数保持原值。',
  parameters: GenerationConfigSchema.partial(),
} as const;

/**
 * 归一化文本：去除首尾空白、统一空白字符，用于溯源校验
 */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 溯源硬闸门：sourceQuote 必须为原文（归一化后）的子串
 */
export function passesSourceGate(sourceQuote: string, sourceText: string): boolean {
  const normQuote = normalizeText(sourceQuote);
  const normSource = normalizeText(sourceText);
  if (!normQuote || !normSource) return false;
  return normSource.includes(normQuote);
}
