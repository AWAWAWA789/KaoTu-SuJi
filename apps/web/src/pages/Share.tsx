import { useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Button, Card, Badge } from '@/components/ui';
import type { CardType } from '@kaotu/shared';

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const shared = trpc.cardSets.byShareToken.useQuery(
    { token: token ?? '' },
    { enabled: !!token },
  );
  const clone = trpc.cardSets.clone.useMutation({
    onSuccess: (data) => {
      utils.cardSets.list.invalidate();
      window.location.href = `/review?set=${data.newCardSetId}`;
    },
  });

  if (!token) return <p className="text-slate-500">无效的分享链接</p>;
  if (shared.isLoading) return <p className="text-slate-500">加载中…</p>;
  if (!shared.data) return <p className="text-slate-500">分享不存在或已失效</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold">{shared.data.title}</h2>
            <p className="text-sm text-slate-500">原文：{shared.data.documentTitle}</p>
          </div>
          {!shared.data.isOwner && me.data && (
            <Button onClick={() => clone.mutate({ token })} disabled={clone.isPending}>
              {clone.isPending ? '克隆中…' : '克隆到我的账户'}
            </Button>
          )}
          {!me.data && (
            <a href={`/login`} className="btn-primary">登录后克隆</a>
          )}
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shared.data.cards.map((c) => (
          <Card key={c.id} className="p-3">
            <Badge>{{ qa: '问答', cloze: '填空', mindmap: '导图' }[c.type as CardType]}</Badge>
            <div className="text-sm mt-2">
              {c.type === 'qa' && (
                <div>
                  <div className="font-medium">问：{(c.payload as any).question}</div>
                  <div className="text-slate-600 mt-1">答：{(c.payload as any).answer}</div>
                </div>
              )}
              {c.type === 'cloze' && (
                <div className="whitespace-pre-wrap">{(c.payload as any).text as string}</div>
              )}
              {c.type === 'mindmap' && (
                <div className="whitespace-pre-wrap font-mono text-xs">
                  {flattenMindMap((c.payload as any).root, 0)}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-2 italic line-clamp-2">来源：{c.sourceQuote}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function flattenMindMap(node: any, depth: number): string {
  const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}${depth === 1 ? '├─ ' : '└─ '}`;
  const lines = [`${prefix}${node.text}`];
  if (node.children) for (const c of node.children) lines.push(flattenMindMap(c, depth + 1));
  return lines.join('\n');
}
