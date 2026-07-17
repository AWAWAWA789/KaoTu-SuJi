/**
 * 文档与卡片组契约
 */
import { z } from 'zod';
import { CardSchema, CardTypeEnum, DifficultyEnum } from './card.js';

export const DOCUMENT_MAX_CHARS = 100_000;

export const CreateDocumentInputSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(DOCUMENT_MAX_CHARS),
});
export type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  content: z.string(),
  charCount: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const CreateCardSetInputSchema = z.object({
  documentId: z.string(),
  title: z.string().min(1).max(200),
  config: z
    .object({
      cardTypes: z.array(CardTypeEnum).min(1).max(3),
      difficulty: DifficultyEnum,
      count: z.number().int().min(1).max(50),
    })
    .partial()
    .optional(),
});
export type CreateCardSetInput = z.infer<typeof CreateCardSetInputSchema>;

export const CardSetSchema = z.object({
  id: z.string(),
  userId: z.string(),
  documentId: z.string(),
  title: z.string(),
  shareToken: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type CardSet = z.infer<typeof CardSetSchema>;

export const CardRecordSchema = z.object({
  id: z.string(),
  cardSetId: z.string(),
  type: CardTypeEnum,
  sourceQuote: z.string(),
  payload: z.record(z.unknown()),
  tags: z.array(z.string()),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type CardRecord = z.infer<typeof CardRecordSchema>;

/** LLM 卡片与持久化卡片共用 CardSchema 校验 */
export { CardSchema };
