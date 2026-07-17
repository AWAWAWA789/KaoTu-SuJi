import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Button, Card, Progress } from '@/components/ui';
import type { Grade } from '@kaotu/shared';

export function ReviewPage() {
  const [sp] = useSearchParams();
  const cardSetId = sp.get('set') ?? undefined;
  const utils = trpc.useUtils();
  const queue = trpc.review.todayQueue.useQuery({ limit: 50 });
  const stats = trpc.review.stats.useQuery();
  const submit = trpc.review.submitGrade.useMutation({
    onSuccess: () => {
      utils.review.todayQueue.invalidate();
      utils.review.stats.invalidate();
    },
  });

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState(0);

  const list = (queue.data ?? []).filter((c) => !cardSetId || true);

  const current = list[idx];

  const grade = (g: Grade) => {
    if (!current) return;
    submit.mutate({
      cardId: current.cardId,
      grade: g,
      clientEventId: `${current.cardId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    setSessionReviewed((n) => n + 1);
    if (idx + 1 >= list.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
      setFlipped(false);
    }
  };

  if (queue.isLoading) return <p className="text-slate-500">加载中…</p>;
  if (done || !current) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <Card className="p-8">
          <h2 className="text-2xl font-bold mb-2">本组复习完成 🎉</h2>
          <p className="text-slate-600 mb-4">本次复习 {sessionReviewed} 张卡片</p>
          <Button onClick={() => { setIdx(0); setDone(false); setFlipped(false); }}>再来一组</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex justify-between items-center text-sm text-slate-500">
        <span>第 {idx + 1} / {list.length} 张</span>
        <span>本组已复习 {sessionReviewed}</span>
      </div>
      <Progress value={(idx / list.length) * 100} />

      <Card className="p-8 min-h-[300px] flex flex-col justify-center cursor-pointer" onClick={() => setFlipped(!flipped)}>
        {current.type === 'qa' && (
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-2">{flipped ? '答案' : '问题'}</div>
            <div className="text-xl font-medium">
              {(flipped ? (current.payload as any).answer : (current.payload as any).question) as string}
            </div>
          </div>
        )}
        {current.type === 'cloze' && (
          <div className="text-center">
            <div className="text-xl font-medium whitespace-pre-wrap">{(current.payload as any).text as string}</div>
            {flipped && (
              <div className="text-brand-600 mt-4">答案：{(current.payload as any).blanks.map((b: any) => b.token).join(' / ')}</div>
            )}
          </div>
        )}
        {current.type === 'mindmap' && (
          <div className="text-sm whitespace-pre-wrap font-mono text-left">
            {flattenMindMap((current.payload as any).root, 0)}
          </div>
        )}
        <div className="text-xs text-slate-400 mt-6 italic text-center">点击卡片{flipped ? '看问题' : '看答案'}</div>
      </Card>

      {flipped && (
        <div className="grid grid-cols-3 gap-3">
          <Button variant="danger" onClick={() => grade('again')}>不认识</Button>
          <Button variant="secondary" onClick={() => grade('hard')}>模糊</Button>
          <Button onClick={() => grade('easy')}>已掌握</Button>
        </div>
      )}

      <Card className="p-4">
        <h3 className="font-semibold mb-2">复习统计</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl font-bold text-brand-600">{Math.round((stats.data?.retentionRate ?? 0) * 100)}%</div>
            <div className="text-xs text-slate-500">保持率</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-brand-600">{stats.data?.streakDays ?? 0}</div>
            <div className="text-xs text-slate-500">连续天数</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-brand-600">{stats.data?.dueCount ?? 0}</div>
            <div className="text-xs text-slate-500">待复习</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function flattenMindMap(node: any, depth: number): string {
  const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}${depth === 1 ? '├─ ' : '└─ '}`;
  const lines = [`${prefix}${node.text}`];
  if (node.children) for (const c of node.children) lines.push(flattenMindMap(c, depth + 1));
  return lines.join('\n');
}
