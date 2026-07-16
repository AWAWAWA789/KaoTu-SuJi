/**
 * 离线评分同步 - 监听 online 事件，幂等去重上传 pending grades
 */
import { useEffect, useRef } from 'react';
import { trpc } from './trpc';
import { getPendingGrades, markGradeSynced } from './offline-db';

export function useOfflineSync() {
  const utils = trpc.useUtils();
  const submit = trpc.review.submitGrade.useMutation();
  const syncingRef = useRef(false);

  const sync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const pending = await getPendingGrades();
      for (const p of pending) {
        // clientEventId 幂等：服务端会自动去重
        try {
          await submit.mutateAsync({
            cardId: p.cardId,
            grade: p.grade,
            clientEventId: p.id,
          });
          await markGradeSynced(p.id);
        } catch (e) {
          // 单条失败不影响其他，下次再试
          console.warn('[sync] grade failed', p.id, e);
        }
      }
      if (pending.length > 0) {
        utils.review.todayQueue.invalidate();
        utils.review.stats.invalidate();
      }
    } finally {
      syncingRef.current = false;
    }
  };

  useEffect(() => {
    const handler = () => {
      void sync();
    };
    window.addEventListener('online', handler);
    // 启动时也尝试一次
    void sync();
    // 每 60s 轮询一次
    const t = setInterval(() => void sync(), 60_000);
    return () => {
      window.removeEventListener('online', handler);
      clearInterval(t);
    };
  }, [sync]);
}
