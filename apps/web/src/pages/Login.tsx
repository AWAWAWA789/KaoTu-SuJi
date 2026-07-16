import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Button, Input, Label } from '@/components/ui';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const sendCode = trpc.auth.sendCode.useMutation({
    onSuccess: () => {
      setSent(true);
      setHint('验证码已发送（开发模式请查看服务端控制台日志）');
    },
    onError: (e) => setError(e.message),
  });
  const verify = trpc.auth.verifyCode.useMutation({
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // tRPC mutation 无法直接 set cookie，需调一次 Hono 路由
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: res.token }),
        credentials: 'include',
      });
      await utils.auth.me.invalidate();
      navigate('/workbench');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm card p-8">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <span className="inline-block w-7 h-7 rounded-md bg-brand-gradient" />
          <span className="font-semibold">考途速记</span>
        </Link>
        <h1 className="text-xl font-bold mb-4">邮箱验证码登录</h1>
        <div className="space-y-3">
          <div>
            <Label>邮箱</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button
            variant="secondary"
            className="w-full"
            disabled={!email || sendCode.isPending}
            onClick={() => sendCode.mutate({ email })}
          >
            {sent ? '重新发送验证码' : '发送验证码'}
          </Button>
          {sent && (
            <div>
              <Label>验证码</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6 位数字"
                maxLength={6}
              />
            </div>
          )}
          {hint && <p className="text-xs text-brand-700">{hint}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button
            className="w-full"
            disabled={!sent || code.length !== 6 || verify.isPending}
            onClick={() => verify.mutate({ email, code })}
          >
            登录
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-4 text-center">
          登录即同意服务条款。新邮箱自动注册。
        </p>
      </div>
    </div>
  );
}
