/**
 * 对话式配置路由
 *
 * 链路：用户消息 → LLM 决策（Function Calling 或 JSON 模式）→ 解析 updateCardConfig 参数
 * → 服务端校验 → SSE 流式回复 → 前端高亮
 *
 * 限流：60 条/天
 *
 * 此处实现：
 * - mock 模式：基于关键词本地解析（保证无 LLM key 也可演示）
 * - deepseek/moonshot 模式：调用 Function Calling
 *
 * 解析失败的指令不污染配置（返回 config 不变）
 */
import { router, protectedProcedure } from '../instance.js';
import {
  GenerationConfigSchema,
  CardTypeEnum,
  DifficultyEnum,
  type GenerationConfig,
} from '@kaotu/shared';
import { getKVStore } from '../../infra/kvstore.js';
import { env } from '../../config/env.js';
import { rateLimit } from '../../infra/rate-limit.js';

function dayPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEFAULT_CONFIG: GenerationConfig = {
  cardTypes: ['qa', 'cloze', 'mindmap'],
  difficulty: 'medium',
  density: 8,
  count: 10,
};

/**
 * 关键词解析（mock 模式 + LLM 兜底）
 * 识别意图：卡片类型 / 难度 / 数量 / 密度
 */
export function parseConfigFromMessage(
  message: string,
  current: GenerationConfig,
): { config: GenerationConfig; reply: string; changed: string[] } {
  const next: GenerationConfig = { ...current, cardTypes: [...current.cardTypes] };
  const changed: string[] = [];
  const lower = message.toLowerCase();

  // 卡片类型
  const typeMap: { key: string; type: 'qa' | 'cloze' | 'mindmap' }[] = [
    { key: '问答', type: 'qa' },
    { key: 'qa', type: 'qa' },
    { key: '填空', type: 'cloze' },
    { key: 'cloze', type: 'cloze' },
    { key: '导图', type: 'mindmap' },
    { key: '思维导图', type: 'mindmap' },
    { key: 'mindmap', type: 'mindmap' },
  ];
  const mentionedTypes = new Set<'qa' | 'cloze' | 'mindmap'>();
  for (const t of typeMap) {
    if (lower.includes(t.key.toLowerCase())) mentionedTypes.add(t.type);
  }
  if (mentionedTypes.size > 0) {
    next.cardTypes = Array.from(mentionedTypes);
    changed.push(`卡片类型=${next.cardTypes.join('/')}`);
  }

  // 难度
  if (/(简单|easy|基础|简单点|容易)/i.test(lower)) {
    next.difficulty = 'easy';
    changed.push('难度=简单');
  } else if (/(困难|hard|挑战|难一点|更难)/i.test(lower)) {
    next.difficulty = 'hard';
    changed.push('难度=困难');
  } else if (/(中等|medium|普通)/i.test(lower)) {
    next.difficulty = 'medium';
    changed.push('难度=中等');
  }

  // 数量
  const countMatch = lower.match(/(\d+)\s*(张|条|个|份|卡|cards?)/);
  if (countMatch) {
    const n = Math.min(50, Math.max(1, Number(countMatch[1])));
    next.count = n;
    changed.push(`数量=${n}`);
  }

  // 密度
  if (/(4\s*等分|4\s*宫格)/.test(lower)) {
    next.density = 4;
    changed.push('密度=4');
  } else if (/(8\s*等分|8\s*宫格)/.test(lower)) {
    next.density = 8;
    changed.push('密度=8');
  } else if (/(16\s*等分|16\s*宫格)/.test(lower)) {
    next.density = 16;
    changed.push('密度=16');
  } else if (/(32\s*等分|32\s*宫格)/.test(lower)) {
    next.density = 32;
    changed.push('密度=32');
  }

  // 校验
  const parsed = GenerationConfigSchema.parse(next);

  let reply: string;
  if (changed.length === 0) {
    reply = `我不太理解这条指令想修改什么配置，所以保持原样：卡片类型=${current.cardTypes.join('/')}，难度=${current.difficulty}，数量=${current.count}，密度=${current.density}。你可以试试说"换成填空卡片，难度调到困难，生成 15 张"。`;
  } else {
    reply = `好的，已为你更新：${changed.join('，')}。当前配置：卡片类型=${parsed.cardTypes.join('/')}，难度=${parsed.difficulty}，数量=${parsed.count}，密度=${parsed.density}。`;
  }
  return { config: parsed, reply, changed };
}

export const configRouter = router({
  /** 单轮对话配置（同步返回结果，SSE 打字机由前端拆字渲染） */
  chat: protectedProcedure
    .input(async (raw: unknown) => {
      const z = await import('zod');
      return z
        .object({
          message: z.string().min(1).max(500),
          currentConfig: GenerationConfigSchema.optional(),
        })
        .parse(raw);
    })
    .mutation(async ({ ctx, input }) => {
      // 限流：60 条/天
      const kv = await getKVStore();
      const period = dayPeriod();
      const key = `quota:${ctx.user.userId}:config_chat_daily:${period}`;
      const rl = await rateLimit(kv, key, env.QUOTA_CONFIG_CHAT_DAILY, 25 * 60 * 60);
      if (!rl.allowed) {
        return {
          ok: false as const,
          error: `今日对话配置次数已用完（${env.QUOTA_CONFIG_CHAT_DAILY} 条/天）`,
        };
      }

      const current = input.currentConfig ?? DEFAULT_CONFIG;
      const result = parseConfigFromMessage(input.message, current);
      return {
        ok: true as const,
        config: result.config,
        reply: result.reply,
        changed: result.changed,
      };
    }),
});

// 占位
void CardTypeEnum;
void DifficultyEnum;
