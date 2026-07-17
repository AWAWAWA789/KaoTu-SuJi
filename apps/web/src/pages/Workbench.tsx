import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Button, Input, Textarea, Label, Card } from '@/components/ui';
import { DOCUMENT_MAX_CHARS } from '@kaotu/shared';

export function WorkbenchPage() {
  const utils = trpc.useUtils();
  const docs = trpc.documents.list.useQuery();
  const sets = trpc.cardSets.list.useQuery();
  const createDoc = trpc.documents.create.useMutation({
    onSuccess: () => utils.documents.list.invalidate(),
  });
  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => utils.documents.list.invalidate(),
  });
  const renameSet = trpc.cardSets.rename.useMutation({
    onSuccess: () => utils.cardSets.list.invalidate(),
  });
  const deleteSet = trpc.cardSets.delete.useMutation({
    onSuccess: () => {
      utils.cardSets.list.invalidate();
      utils.documents.list.invalidate();
    },
  });
  const share = trpc.cardSets.share.useMutation({
    onSuccess: (data, vars) => {
      const url = `${window.location.origin}/share/${data.shareToken}`;
      navigator.clipboard?.writeText(url);
      alert(`分享链接已复制：\n${url}`);
      void vars;
    },
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const navigate = useNavigate();

  const doCreate = async () => {
    if (!title || !content) return;
    await createDoc.mutateAsync({ title, content });
    setTitle('');
    setContent('');
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold mb-4">新建文档</h2>
        <Card className="space-y-3">
          <div>
            <Label>标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：OSI 七层模型" />
          </div>
          <div>
            <Label>
              正文（{content.length} / {DOCUMENT_MAX_CHARS} 字符）
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴教材原文…"
              className="min-h-[200px]"
            />
            {content.length > DOCUMENT_MAX_CHARS && (
              <p className="text-xs text-red-600 mt-1">超过字符上限 {DOCUMENT_MAX_CHARS}</p>
            )}
          </div>
          <Button disabled={!title || !content || createDoc.isPending} onClick={doCreate}>
            创建文档
          </Button>
        </Card>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">我的文档</h2>
        {docs.isLoading ? (
          <p className="text-slate-500">加载中…</p>
        ) : docs.data && docs.data.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-3">
            {docs.data.map((d) => (
              <Card key={d.id} className="flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{d.title}</div>
                    <div className="text-xs text-slate-500">{d.charCount} 字符 · {new Date(d.createdAt * 1000).toLocaleString()}</div>
                  </div>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => {
                      if (confirm(`删除文档《${d.title}》？`)) deleteDoc.mutate({ id: d.id });
                    }}
                  >
                    删除
                  </button>
                </div>
                <Link to={`/generate?doc=${d.id}`} className="btn-primary text-xs self-start">
                  去生成卡片 →
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">暂无文档，先创建一个吧</p>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">我的卡片组</h2>
        {sets.isLoading ? (
          <p className="text-slate-500">加载中…</p>
        ) : sets.data && sets.data.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-3">
            {sets.data.map((s) => (
              <Card key={s.id} className="flex flex-col gap-2">
                {renaming === s.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                    />
                    <Button
                      onClick={() => {
                        renameSet.mutate({ id: s.id, title: renameVal });
                        setRenaming(null);
                      }}
                    >
                      保存
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-xs text-slate-500">{new Date(s.createdAt * 1000).toLocaleString()}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="text-xs text-slate-500 hover:underline"
                        onClick={() => {
                          setRenaming(s.id);
                          setRenameVal(s.title);
                        }}
                      >
                        重命名
                      </button>
                      <button
                        className="text-xs text-brand-600 hover:underline"
                        onClick={() => share.mutate({ id: s.id })}
                      >
                        分享
                      </button>
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => {
                          if (confirm(`删除卡片组《${s.title}》？`)) deleteSet.mutate({ id: s.id });
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 text-xs">
                  <Link to={`/review?set=${s.id}`} className="btn-secondary text-xs">复习</Link>
                  <Link to={`/print?set=${s.id}`} className="btn-secondary text-xs">打印</Link>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => navigate(`/print?set=${s.id}`)}
                  >
                    PDF
                  </button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">暂无卡片组，先去文档页生成</p>
        )}
      </section>
    </div>
  );
}
