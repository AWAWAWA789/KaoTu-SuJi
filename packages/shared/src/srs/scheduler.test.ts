import { describe, it, expect } from 'vitest';
import {
  schedule,
  newCardState,
  nextEf,
  NEW_CARD_STEPS,
  INITIAL_EF,
  MIN_EF,
  GRADUATED_REPETITIONS,
  isDue,
  type SrsState,
} from './scheduler.js';
import type { Grade } from '../contracts/review.js';

const DAY = 24 * 60 * 60 * 1000;

describe('nextEf', () => {
  it('quality=5 增加 EF', () => {
    // delta = 0.1 - (5-5)*(...) = 0.1
    expect(nextEf(2.5, 5)).toBeCloseTo(2.6, 4);
  });
  it('quality=4 EF 不变', () => {
    // delta = 0.1 - (5-4)*(0.08 + (5-4)*0.02) = 0.1 - 1*0.1 = 0
    expect(nextEf(2.5, 4)).toBeCloseTo(2.5, 4);
  });
  it('quality=3 EF 略微降低', () => {
    // delta = 0.1 - 2*(0.08+0.04) = 0.1 - 0.24 = -0.14
    expect(nextEf(2.5, 3)).toBeCloseTo(2.36, 4);
  });
  it('quality=1 显著降低 EF', () => {
    expect(nextEf(2.5, 1)).toBeLessThan(2.36);
  });
  it('EF 不会低于 MIN_EF', () => {
    expect(nextEf(1.3, 1)).toBeGreaterThanOrEqual(MIN_EF);
    expect(nextEf(1.31, 0)).toBeGreaterThanOrEqual(MIN_EF);
  });
  it('quality=0 也会被钳制到 MIN_EF', () => {
    expect(nextEf(2.5, 0)).toBeGreaterThanOrEqual(MIN_EF);
  });
  it('越界 quality 抛错', () => {
    expect(() => nextEf(2.5, 6)).toThrow();
    expect(() => nextEf(2.5, -1)).toThrow();
  });
});

describe('schedule - 阶梯阶段', () => {
  const now = 1_700_000_000_000;

  it('新卡 easy：step 0→1，间隔 = 第2格', () => {
    const s = newCardState(now);
    const r = schedule(s, 'easy', now);
    expect(r.state.step).toBe(1);
    expect(r.state.intervalDays).toBe(NEW_CARD_STEPS[1]);
    expect(r.state.dueAt).toBe(now + NEW_CARD_STEPS[1]! * DAY);
    expect(r.graduated).toBe(false);
  });

  it('新卡 hard：step 不前进', () => {
    const s = newCardState(now);
    const r = schedule(s, 'hard', now);
    expect(r.state.step).toBe(0);
    expect(r.state.intervalDays).toBe(NEW_CARD_STEPS[0]);
    expect(r.graduated).toBe(false);
  });

  it('新卡 again：step 重置为 0', () => {
    const s: SrsState = { ...newCardState(now), step: 3 };
    const r = schedule(s, 'again', now);
    expect(r.state.step).toBe(0);
    expect(r.state.intervalDays).toBe(NEW_CARD_STEPS[0]);
  });

  it('阶梯最后一步 easy 触发毕业', () => {
    const s: SrsState = {
      ...newCardState(now),
      step: NEW_CARD_STEPS.length - 1,
      repetitions: 0,
    };
    const r = schedule(s, 'easy', now);
    expect(r.graduated).toBe(true);
    expect(r.state.repetitions).toBe(GRADUATED_REPETITIONS);
    expect(r.state.ef).toBe(INITIAL_EF);
  });

  it('阶梯 hard 在最后一步保持不毕业', () => {
    const s: SrsState = {
      ...newCardState(now),
      step: NEW_CARD_STEPS.length - 1,
      repetitions: 0,
    };
    const r = schedule(s, 'hard', now);
    expect(r.graduated).toBe(false);
    expect(r.state.intervalDays).toBe(NEW_CARD_STEPS[NEW_CARD_STEPS.length - 1]);
  });
});

describe('schedule - 已毕业阶段', () => {
  const now = 1_700_000_000_000;

  it('毕业卡 easy：interval = round(prev * ef)，repetitions +1', () => {
    const s: SrsState = {
      step: NEW_CARD_STEPS.length,
      ef: 2.5,
      intervalDays: 15,
      repetitions: GRADUATED_REPETITIONS,
      dueAt: now,
      lastReviewedAt: null,
    };
    const r = schedule(s, 'easy', now);
    expect(r.state.repetitions).toBe(GRADUATED_REPETITIONS + 1);
    // easy: q=5, EF=2.6, interval = round(15 * 2.6) = 39
    expect(r.state.intervalDays).toBe(Math.round(15 * 2.6));
    expect(r.graduated).toBe(true);
  });

  it('毕业卡 hard：interval = round(prev * ef * 0.8)', () => {
    const s: SrsState = {
      step: NEW_CARD_STEPS.length,
      ef: 2.5,
      intervalDays: 10,
      repetitions: GRADUATED_REPETITIONS,
      dueAt: now,
      lastReviewedAt: null,
    };
    const r = schedule(s, 'hard', now);
    // hard: q=3, EF=2.36, interval = round(round(10 * 2.36) * 0.8) = round(24 * 0.8) = 19
    const baseEf = 2.36;
    const expected = Math.max(1, Math.round(Math.round(10 * baseEf) * 0.8));
    expect(r.state.intervalDays).toBe(expected);
  });

  it('毕业卡 again：回到阶梯起点，repetitions=0', () => {
    const s: SrsState = {
      step: NEW_CARD_STEPS.length,
      ef: 2.5,
      intervalDays: 30,
      repetitions: 10,
      dueAt: now,
      lastReviewedAt: null,
    };
    const r = schedule(s, 'again', now);
    expect(r.state.repetitions).toBe(0);
    expect(r.state.step).toBe(0);
    expect(r.state.intervalDays).toBe(NEW_CARD_STEPS[0]);
    expect(r.state.ef).toBeLessThan(2.5); // EF 被惩罚
    expect(r.graduated).toBe(false);
  });
});

describe('schedule - 通用属性', () => {
  const now = 1_700_000_000_000;
  it('quality 映射正确', () => {
    const s = newCardState(now);
    expect(schedule(s, 'again', now).quality).toBe(1);
    expect(schedule(s, 'hard', now).quality).toBe(3);
    expect(schedule(s, 'easy', now).quality).toBe(5);
  });
  it('lastReviewedAt 更新为 now', () => {
    const s = newCardState(now);
    const r = schedule(s, 'easy', now);
    expect(r.state.lastReviewedAt).toBe(now);
  });
  it('dueAt = now + intervalDays 天', () => {
    const s = newCardState(now);
    const r = schedule(s, 'easy', now);
    expect(r.state.dueAt).toBe(now + r.state.intervalDays * DAY);
  });
});

describe('isDue', () => {
  it('dueAt <= now 视为到期', () => {
    expect(isDue({ dueAt: 100 } as SrsState, 100)).toBe(true);
    expect(isDue({ dueAt: 99 } as SrsState, 100)).toBe(true);
  });
  it('dueAt > now 视为未到期', () => {
    expect(isDue({ dueAt: 101 } as SrsState, 100)).toBe(false);
  });
});

describe('30 天连续复习模拟', () => {
  it('不认识的卡片不会进入毕业状态', () => {
    let s = newCardState(0);
    for (let day = 0; day < 30; day++) {
      s = schedule(s, 'again' as Grade, day * DAY).state;
    }
    expect(s.repetitions).toBe(0);
    expect(s.step).toBe(0);
  });

  it('每天 easy 的卡片应毕业并不断扩展间隔', () => {
    let s = newCardState(0);
    let prevInterval = 0;
    for (let day = 0; day < 30; day++) {
      const r = schedule(s, 'easy', day * DAY);
      // 间隔不应回退（除非 EF 下降，但 easy 不会让 EF 下降）
      expect(r.state.intervalDays).toBeGreaterThanOrEqual(prevInterval);
      prevInterval = r.state.intervalDays;
      s = r.state;
    }
    expect(s.repetitions).toBeGreaterThan(GRADUATED_REPETITIONS);
  });

  it('混合评分下不应出现负间隔或负 EF', () => {
    let s = newCardState(0);
    const grades: Grade[] = ['easy', 'hard', 'again', 'easy', 'easy', 'hard'];
    for (let day = 0; day < 30; day++) {
      const g = grades[day % grades.length]!;
      const r = schedule(s, g, day * DAY);
      expect(r.state.intervalDays).toBeGreaterThanOrEqual(1);
      expect(r.state.ef).toBeGreaterThanOrEqual(MIN_EF);
      expect(r.state.dueAt).toBeGreaterThan(day * DAY);
      s = r.state;
    }
  });
});
