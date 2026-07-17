import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input } from '@/components/ui';
import {
  type CardType,
  type Difficulty,
  type GenerationConfig,
} from '@kaotu/shared';

const PRESETS = [
  '帮我生成 15 张问答卡片',
  '切换到填空和导图，难度调到困难',
  '改成 16 等分打印密度',
];

export function SettingsPage() {
  const me = trpc.auth.me.useQuery();
  const logoutMut = trpc.auth.logout.useMutation();
  const configChat = trpc.config.chat.useMutation();

  const [config, setConfig] = useState<GenerationConfig>({
    cardTypes: ['qa', 'cloze', 'mindmap'],
    difficulty: 'medium',
    density: 8,
    count: 10,
  });
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [typed, setTyped] = useState('');
  const [changedKeys, setChangedKeys] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const send = async (msg: string) => {
    setMessage(msg);
    const res = await configChat.mutateAsync({ message: msg, currentConfig: config });
    if (!res.ok) {
      setReply(res.error);
      return;
    }
    setConfig(res.config);
    setReply(res.reply);
    setChangedKeys(res.changed);
    // 配置面板高亮
    for (const k of res.changed) {
      setHighlighted(k);
      setTimeout(() => setHighlighted(null), 1500);
    }
    // 打字机渲染
    setTyped('');
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(res.reply.slice(0, i));
      if (i >= res.reply.length) clearInterval(interval);
    }, 30);
  };

  const logout = async () => {
    await logoutMut.mutateAsync();
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <h2 className="font-semibold mb-2">账户</h2>
        <div className="text-sm text-slate-600">
          <div>邮箱：{me.data?.email}</div>
          <div>套餐：{me.data?.plan}</div>
        </div>
        <Button variant="secondary" className="mt-3" onClick={logout}>登出</Button>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">当前生成配置</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <ConfigRow
            label="卡片形态"
            value={config.cardTypes.map((t) => ({ qa: '问答', cloze: '填空', mindmap: '导图' }[t as CardType])).join('/')}
            highlighted={highlighted?.includes('卡片类型')}
          />
          <ConfigRow
            label="难度"
            value={{ easy: '简单', medium: '中等', hard: '困难' }[config.difficulty as Difficulty]}
            highlighted={highlighted?.includes('难度')}
          />
          <ConfigRow label="数量" value={String(config.count)} highlighted={highlighted?.includes('数量')} />
          <ConfigRow label="密度" value={`${config.density} 等分`} highlighted={highlighted?.includes('密度')} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">对话式配置</h2>
        <div className="flex gap-2 mb-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="例如：换成填空卡片，难度调到困难，生成 15 张"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && message.trim()) send(message);
            }}
          />
          <Button onClick={() => message.trim() && send(message)}>发送</Button>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p}
              className="text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200"
              onClick={() => send(p)}
            >
              {p}
            </button>
          ))}
        </div>
        {reply && (
          <div className="text-sm bg-slate-50 p-3 rounded">
            <span className="text-brand-700 font-medium">助手：</span>
            {typed}
            <span className="animate-pulse">|</span>
          </div>
        )}
      </Card>
    </div>
  );
}

function ConfigRow({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex justify-between p-2 rounded ${
        highlighted ? 'bg-brand-100 ring-2 ring-brand-400' : ''
      }`}
    >
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
