/**
 * SM-2 改良调度器 - 前后端共用的纯函数实现
 *
 * 规则（指令书 4.3）：
 * - 新卡走阶梯：NEW_CARD_STEPS = [1, 2, 4, 7, 15] 天
 * - 毕业后（repetitions >= steps.length）走 SM-2 动态 EF 调度
 * - 三档评分映射：again=1 / hard=3 / easy=5
 * - EF 范围 [MIN_EF=1.3, +∞)，初始 INITIAL_EF=2.5
 * - quality < 3 重置 repetitions 为 0（回到新卡阶梯起点）
 *
 * 设计目标：分支覆盖率 100%
 */
import type { Grade } from '../contracts/review.js';

export const NEW_CARD_STEPS = [1, 2, 4, 7, 15] as const;
export const INITIAL_EF = 2.5;
export const MIN_EF = 1.3;
export const GRADUATED_REPETITIONS = NEW_CARD_STEPS.length;

export interface SrsState {
  step: number;
  ef: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number | null;
}

export interface SrsResult {
  state: SrsState;
  quality: number;
  prevInterval: number;
  nextInterval: number;
  prevEf: number;
  nextEf: number;
  graduated: boolean;
}

/**
 * 计算新的 EF（SM-2 公式改良版）
 *
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * 限制 EF' >= MIN_EF
 */
export function nextEf(currentEf: number, quality: number): number {
  if (quality < 0 || quality > 5) {
    throw new Error(`quality out of range: ${quality}`);
  }
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const next = currentEf + delta;
  return Math.max(MIN_EF, Number(next.toFixed(4)));
}

/**
 * 阶梯阶段：根据 step 返回下一个间隔
 *
 * - again：step 重置为 0，间隔 = 1 天（今日再见）
 * - hard：step 不变，间隔 = 当前 step 对应天数
 * - easy：step 前进，间隔 = 下一个 step 对应天数；若已到最后则毕业
 */
function ladderNext(
  step: number,
  grade: Grade,
): { step: number; intervalDays: number; graduated: boolean } {
  if (grade === 'again') {
    return { step: 0, intervalDays: NEW_CARD_STEPS[0]!, graduated: false };
  }
  if (grade === 'hard') {
    const idx = Math.min(step, NEW_CARD_STEPS.length - 1);
    return { step: idx, intervalDays: NEW_CARD_STEPS[idx]!, graduated: false };
  }
  // easy：前进一格
  const nextStep = step + 1;
  if (nextStep >= NEW_CARD_STEPS.length) {
    // 毕业，进入 SM-2 调度
    return {
      step: NEW_CARD_STEPS.length,
      intervalDays: NEW_CARD_STEPS[NEW_CARD_STEPS.length - 1]!,
      graduated: true,
    };
  }
  return {
    step: nextStep,
    intervalDays: NEW_CARD_STEPS[nextStep]!,
    graduated: false,
  };
}

/**
 * 已毕业阶段：SM-2 动态调度
 *
 * - again：repetitions = 0，回到阶梯起点（但保留 EF 衰减）
 * - hard：interval = round(prevInterval * EF * 0.8)，repetitions += 1
 * - easy：interval = round(prevInterval * EF)，repetitions += 1
 *
 * 毕业后第一次评分：prevInterval = NEW_CARD_STEPS[last] = 15 天
 */
function graduatedNext(
  state: SrsState,
  quality: number,
  grade: Grade,
): { step: number; intervalDays: number; repetitions: number; ef: number } {
  const ef = nextEf(state.ef, quality);

  if (grade === 'again') {
    // 回到阶梯起点，但 EF 已被惩罚
    return {
      step: 0,
      intervalDays: NEW_CARD_STEPS[0]!,
      repetitions: 0,
      ef,
    };
  }

  // hard / easy：SM-2 间隔增长
  const baseInterval = state.intervalDays < 1 ? 1 : state.intervalDays;
  let nextInterval = Math.max(1, Math.round(baseInterval * ef));
  // hard 模式额外乘 0.8（更慢）
  if (grade === 'hard') {
    nextInterval = Math.max(1, Math.round(nextInterval * 0.8));
  }
  return {
    step: state.step,
    intervalDays: nextInterval,
    repetitions: state.repetitions + 1,
    ef,
  };
}

/**
 * 调度核心：根据当前状态与评分，计算下一个状态
 *
 * @param state 当前状态
 * @param grade 评分档位
 * @param now 当前时间戳（毫秒）
 */
export function schedule(state: SrsState, grade: Grade, now: number): SrsResult {
  const quality =
    grade === 'again' ? 1 : grade === 'hard' ? 3 : 5;

  const prevInterval = state.intervalDays;
  const prevEf = state.ef;

  const isGraduated = state.repetitions >= GRADUATED_REPETITIONS;

  let nextStep: number;
  let nextInterval: number;
  let nextRepetitions: number;
  let nextEfValue: number;
  let graduated: boolean;

  if (!isGraduated) {
    // 阶梯阶段
    const r = ladderNext(state.step, grade);
    nextStep = r.step;
    nextInterval = r.intervalDays;
    graduated = r.graduated;
    if (graduated) {
      nextRepetitions = GRADUATED_REPETITIONS;
      nextEfValue = INITIAL_EF;
    } else {
      nextRepetitions = state.repetitions; // 阶梯阶段 repetitions 不变
      // 阶梯阶段 EF 也根据 quality 微调，但不影响阶梯间隔
      nextEfValue = nextEf(state.ef, quality);
    }
  } else {
    // 已毕业
    const r = graduatedNext(state, quality, grade);
    nextStep = r.step;
    nextInterval = r.intervalDays;
    nextRepetitions = r.repetitions;
    nextEfValue = r.ef;
    graduated = nextRepetitions >= GRADUATED_REPETITIONS;
  }

  const dueAt = now + nextInterval * 24 * 60 * 60 * 1000;

  return {
    state: {
      step: nextStep,
      ef: nextEfValue,
      intervalDays: nextInterval,
      repetitions: nextRepetitions,
      dueAt,
      lastReviewedAt: now,
    },
    quality,
    prevInterval,
    nextInterval,
    prevEf,
    nextEf: nextEfValue,
    graduated,
  };
}

/**
 * 新卡的初始状态
 */
export function newCardState(now: number): SrsState {
  return {
    step: 0,
    ef: INITIAL_EF,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now, // 立即可复习
    lastReviewedAt: null,
  };
}

/**
 * 判断卡片是否"今日到期"
 */
export function isDue(state: SrsState, now: number): boolean {
  return state.dueAt <= now;
}
