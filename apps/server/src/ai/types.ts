/** AI 生成相关类型 */
import type { CardBatch, GenerationConfig } from '@kaotu/shared';

export interface GenerateInput {
  sourceText: string;
  config: GenerationConfig;
  /** 进度回调（0~100） */
  onProgress?: (stage: 'analyzing' | 'extracting' | 'generating', progress: number) => void;
}

export interface GenerateOutput {
  cards: CardBatch['cards'];
  /** 丢弃的卡片数（溯源硬闸门失败等） */
  discarded: number;
  provider: string;
  chunks?: number;
}

export interface LLMProvider {
  name: string;
  generateCards(input: GenerateInput): Promise<GenerateOutput>;
}

export interface GenerationJobPayload {
  jobId: string;
  userId: string;
  documentId: string;
  cardSetId: string;
  config: GenerationConfig;
}
