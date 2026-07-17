/**
 * 打印与 PDF 契约
 */
import { z } from 'zod';
import { CardTypeEnum } from './card.js';

export const DensityEnum = z.enum(['4', '8', '16', '32']);
export type Density = z.infer<typeof DensityEnum>;

export const LayoutItemSchema = z.object({
  cardId: z.string(),
  type: CardTypeEnum,
  // 渲染后的纯文本（用于排版测量）
  front: z.string(),
  back: z.string(),
});

export const LayoutInputSchema = z.object({
  cards: z.array(LayoutItemSchema),
  density: DensityEnum,
});

export type LayoutInput = z.infer<typeof LayoutInputSchema>;

export const LayoutPageSchema = z.object({
  index: z.number().int().nonnegative(),
  slots: z.array(
    z.object({
      cardId: z.string(),
      type: CardTypeEnum,
      front: z.string(),
      back: z.string(),
      fontSize: z.number().positive(),
    }),
  ),
});

export const LayoutResultSchema = z.object({
  pages: z.array(LayoutPageSchema),
  density: DensityEnum,
  overflowed: z.boolean(),
  suggestedDensity: DensityEnum.nullable(),
  warnings: z.array(z.string()),
});
export type LayoutResult = z.infer<typeof LayoutResultSchema>;

export const ExportPdfInputSchema = z.object({
  cardSetId: z.string(),
  density: DensityEnum,
});
export type ExportPdfInput = z.infer<typeof ExportPdfInputSchema>;
