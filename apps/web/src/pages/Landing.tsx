import { Link } from 'react-router-dom';

const EBINGHAUS_POINTS = [
  { day: 0, retain: 100 },
  { day: 1, retain: 33 },
  { day: 2, retain: 28 },
  { day: 4, retain: 24 },
  { day: 7, retain: 20 },
  { day: 15, retain: 16 },
  { day: 30, retain: 12 },
];

function EbinghausSvg() {
  const w = 480;
  const h = 220;
  const pad = 36;
  const maxDay = 30;
  const toX = (d: number) => pad + (d / maxDay) * (w - pad * 2);
  const toY = (r: number) => h - pad - (r / 100) * (h - pad * 2);
  const path = EBINGHAUS_POINTS.map(
    (p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.day)} ${toY(p.retain)}`,
  ).join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-xl animate-draw-stroke"
      strokeDasharray="1000"
      strokeDashoffset="1000"
    >
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#cbd5e1" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#cbd5e1" />
      <text x={pad} y={pad - 8} fontSize="10" fill="#64748b">保持率%</text>
      <text x={w - pad} y={h - pad + 14} fontSize="10" fill="#64748b">天数</text>
      <path d={path} fill="none" stroke="#0d9488" strokeWidth="3" />
      {EBINGHAUS_POINTS.map((p) => (
        <circle key={p.day} cx={toX(p.day)} cy={toY(p.retain)} r="3" fill="#0284c7" />
      ))}
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <nav className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-7 h-7 rounded-md bg-brand-gradient" />
          <span className="font-semibold">考途速记</span>
        </div>
        <div className="flex gap-2">
          <Link to="/login" className="btn-secondary">登录</Link>
          <Link to="/workbench" className="btn-primary">进入工作台</Link>
        </div>
      </nav>

      <section className="bg-brand-gradient text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl font-bold leading-tight mb-4">
              8 小时复习，5 分钟搞定
            </h1>
            <p className="text-white/90 text-lg mb-6">
              粘贴教材原文 → AI 一键生成可溯源、可复习、可打印的记忆卡片。SM-2 间隔重复，艾宾浩斯遗忘曲线自动调度。
            </p>
            <div className="flex gap-3">
              <Link to="/login" className="btn bg-white text-brand-700 hover:bg-white/90">免费开始</Link>
              <Link to="/workbench" className="btn border border-white/40 text-white hover:bg-white/10">查看示例</Link>
            </div>
          </div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur">
            <EbinghausSvg />
            <p className="text-center text-white/80 text-sm mt-2">艾宾浩斯遗忘曲线 · 滚动描边</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 grid md:grid-cols-3 gap-6">
        {[
          { t: '可溯源', d: '每张卡片带 sourceQuote，原文定位一键可达', icon: '🔍' },
          { t: '可复习', d: 'SM-2 改良引擎，三档评分按记忆曲线调度', icon: '🔁' },
          { t: '可打印', d: 'A4 4/8/16/32 等分自动排版，溢出零静默截断', icon: '🖨️' },
        ].map((f) => (
          <div key={f.t} className="card p-6">
            <div className="text-3xl mb-2">{f.icon}</div>
            <h3 className="font-semibold text-lg mb-1">{f.t}</h3>
            <p className="text-slate-600 text-sm">{f.d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="card p-8 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h2 className="text-2xl font-bold mb-3">8 小时 vs 5 分钟</h2>
            <p className="text-slate-600 mb-4">
              传统手抄笔记需要 8 小时整理 + 反复抄写，考途速记 5 分钟生成 + 自动复习调度。
              零摩擦，更省时。
            </p>
            <Link to="/login" className="btn-primary">立即体验</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-100 p-4 text-center">
              <div className="text-3xl font-bold text-slate-500">8h</div>
              <div className="text-xs text-slate-500 mt-1">手抄整理</div>
            </div>
            <div className="rounded-lg bg-brand-50 p-4 text-center">
              <div className="text-3xl font-bold text-brand-600">5min</div>
              <div className="text-xs text-brand-600 mt-1">AI 生成</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t mt-12 py-6 text-center text-sm text-slate-500">
        考途速记 · AI 记忆卡片系统
      </footer>
    </div>
  );
}
