import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Button, Input, Label, Card, Progress, Badge } from '@/components/ui';
import {
  GenerationConfigSchema,
  type CardType,
  type GenerationConfig,
  type Difficulty,
} from '@kaotu/shared';

type Stage = 'idle' | 'queued' | 'analyzing' | 'extracting' | 'generating' | 'done' | 'failed';

export function GeneratePage() {
  const [sp] = useSearchParams();
  const documentId = sp.get('doc') ?? '';
  const utils = trpc.useUtils();
  const doc = trpc.documents.get.useQuery({ id: documentId }, { enabled: !!documentId });
  const createJob = trpc.generation.createJob.useMutation();

  const [config, setConfig] = useState<GenerationConfig>({
    cardTypes: ['qa', 'cloze', 'mindmap'],
    difficulty: 'medium',
    density: 8,
    count: 10,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [cardSetId, setCardSetId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // SSE 订阅
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/sse/generation/${jobId}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'progress') {
          setStage(data.status as Stage);
          setProgress(data.progress);
        } else if (data.type === 'done') {
          setStage(data.status as Stage);
          setProgress(100);
          es.close();
          if (cardSetId) utils.cards.listBySet.invalidate({ cardSetId });
        } else if (data.type === 'error') {
          setError(data.message);
          es.close();
        }
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      // 浏览器会自动重连，直到 done/failed
    };
    return () => es.close();
  }, [jobId, cardSetId, utils]);

  const cards = trpc.cards.listBySet.useQuery(
    { cardSetId: cardSetId ?? '' },
    { enabled: !!cardSetId },
  );

  const start = async () => {
    if (!documentId) return;
    setError(null);
    setStage('queued');
    setProgress(0);
    const valid = GenerationConfigSchema.parse(config);
    const res = await createJob.mutateAsync({
      documentId,
      title: `${doc.data?.title ?? '新卡片组'} - ${new Date().toLocaleDateString()}`,
      config: valid,
    });
    if (!res.ok) {
      setError(res.error);
      setStage('failed');
      return;
    }
    setJobId(res.jobId);
    setCardSetId(res.cardSetId);
  };

  const toggleType = (t: CardType) => {
    const has = config.cardTypes.includes(t);
    const next = has ? config.cardTypes.filter((x) => x !== t) : [...config.cardTypes, t];
    if (next.length === 0) return;
    setConfig({ ...config, cardTypes: next });
  };

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold mb-3">生成配置</h2>
          <div className="space-y-3">
            <div>
              <Label>卡片形态</Label>
              <div className="flex gap-2 flex-wrap">
                {(['qa', 'cloze', 'mindmap'] as CardType[]).map((t) => (
                  <button
                    key={t}
                    className={`px-3 py-1 rounded-md text-sm border ${
                      config.cardTypes.includes(t)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white border-slate-300'
                    }`}
                    onClick={() => toggleType(t)}
                  >
                    {{ qa: '问答', cloze: '填空', mindmap: '导图' }[t]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>难度</Label>
              <select
                className="input"
                value={config.difficulty}
                onChange={(e) => setConfig({ ...config, difficulty: e.target.value as Difficulty })}
              >
                <option value="easy">简单（基础定义）</option>
                <option value="medium">中等（概念辨析）</option>
                <option value="hard">困难（综合应用）</option>
              </select>
            </div>
            <div>
              <Label>数量（1-50）</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={config.count}
                onChange={(e) => setConfig({ ...config, count: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>A4 打印密度</Label>
              <select
                className="input"
                value={config.density}
                onChange={(e) => setConfig({ ...config, density: Number(e.target.value) as 4 | 8 | 16 | 32 })}
              >
                <option value={4}>4 等分（大格）</option>
                <option value={8}>8 等分</option>
                <option value={16}>16 等分</option>
                <option value={32}>32 等分（小格）</option>
              </select>
            </div>
            <Button className="w-full" disabled={!documentId || stage === 'analyzing' || stage === 'extracting' || stage === 'generating'} onClick={start}>
              开始生成
            </Button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">原文</div>
          <div className="text-sm line-clamp-3">{doc.data?.title ?? '未选择文档'}</div>
          <div className="text-xs text-slate-500 mt-2 line-clamp-6">{doc.data?.content}</div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold">生成进度</h2>
            {stage !== 'idle' && <Badge>{stageLabel(stage)}</Badge>}
          </div>
          {stage === 'idle' ? (
            <p className="text-slate-500 text-sm">点击"开始生成"启动</p>
          ) : (
            <>
              <Progress value={progress} />
              <p className="text-xs text-slate-500 mt-2">{progress}%</p>
            </>
          )}
        </Card>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">生成结果</h2>
            {cardSetId && (
              <div className="flex gap-2 text-xs">
                <Link to={`/review?set=${cardSetId}`} className="btn-secondary text-xs">去复习</Link>
                <Link to={`/print?set=${cardSetId}`} className="btn-secondary text-xs">去打印</Link>
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(cards.data ?? []).map((c, i) => (
              <CardItem key={c.id} card={c} index={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function stageLabel(s: Stage): string {
  return {
    idle: '待开始',
    queued: '排队中',
    analyzing: '分析中',
    extracting: '抽取中',
    generating: '生成中',
    done: '已完成',
    failed: '失败',
  }[s];
}

function CardItem({ card, index }: { card: any; index: number }) {
  const [flipped, setFlipped] = useState(false);
  const utils = trpc.useUtils();
  const update = trpc.cards.update.useMutation({
    onSuccess: () => utils.cards.listBySet.invalidate(),
  });
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');

  useEffect(() => {
    if (card.type === 'qa') {
      setQ(card.payload.question ?? '');
      setA(card.payload.answer ?? '');
    }
  }, [card]);

  return (
    <div
      className="card p-3 cursor-pointer animate-fade-in-up"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'backwards' }}
      onClick={() => !editing && setFlipped(!flipped)}
    >
      <div className="flex justify-between items-center mb-2">
        <Badge>{{ qa: '问答', cloze: '填空', mindmap: '导图' }[card.type as CardType]}</Badge>
        <button
          className="text-xs text-slate-400 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(!editing);
          }}
        >
          {editing ? '关闭' : '编辑'}
        </button>
      </div>
      {card.type === 'qa' && !editing && (
        <div className="text-sm">
          <div className="font-medium">{flipped ? '答：' : '问：'}{(flipped ? card.payload.answer : card.payload.question) as string}</div>
        </div>
      )}
      {card.type === 'qa' && editing && (
        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="问题" />
          <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="答案" />
          <Button
            onClick={() => {
              update.mutate({
                id: card.id,
                payload: { type: 'qa', question: q, answer: a },
              });
              setEditing(false);
            }}
          >
            保存
          </Button>
        </div>
      )}
      {card.type === 'cloze' && (
        <div className="text-sm whitespace-pre-wrap">{card.payload.text as string}</div>
      )}
      {card.type === 'mindmap' && (
        <div className="text-sm whitespace-pre-wrap font-mono">
          {flattenMindMap(card.payload.root, 0)}
        </div>
      )}
      <div className="text-xs text-slate-400 mt-2 italic line-clamp-2">来源：{card.sourceQuote as string}</div>
    </div>
  );
}

function flattenMindMap(node: any, depth: number): string {
  const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}${depth === 1 ? '├─ ' : '└─ '}`;
  const lines = [`${prefix}${node.text}`];
  if (node.children) for (const c of node.children) lines.push(flattenMindMap(c, depth + 1));
  return lines.join('\n');
}
