import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { LandingPage } from '@/pages/Landing';
import { LoginPage } from '@/pages/Login';
import { WorkbenchPage } from '@/pages/Workbench';
import { GeneratePage } from '@/pages/Generate';
import { ReviewPage } from '@/pages/Review';
import { PrintPage } from '@/pages/Print';
import { SettingsPage } from '@/pages/Settings';
import { SharePage } from '@/pages/Share';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';

function Layout({ children }: { children: React.ReactNode }) {
  const me = trpc.auth.me.useQuery();
  const loc = useLocation();
  const isLandingOrLogin = loc.pathname === '/' || loc.pathname === '/login';

  if (isLandingOrLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link to="/workbench" className="flex items-center gap-2">
            <span className="inline-block w-7 h-7 rounded-md bg-brand-gradient" />
            <span className="font-semibold">考途速记</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/workbench">工作台</NavLink>
            <NavLink to="/review">复习</NavLink>
            <NavLink to="/print">打印</NavLink>
            <NavLink to="/settings">设置</NavLink>
            {me.data && (
              <span className="ml-2 text-slate-500 text-xs">{me.data.email}</span>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md hover:bg-slate-100 text-slate-700"
    >
      {children}
    </Link>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = trpc.auth.me.useQuery();
  if (me.isLoading) return <div className="p-8 text-slate-500">加载中…</div>;
  if (!me.data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/workbench"
          element={
            <RequireAuth>
              <WorkbenchPage />
            </RequireAuth>
          }
        />
        <Route
          path="/generate"
          element={
            <RequireAuth>
              <GeneratePage />
            </RequireAuth>
          }
        />
        <Route
          path="/review"
          element={
            <RequireAuth>
              <ReviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/print"
          element={
            <RequireAuth>
              <PrintPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="/share/:token" element={<SharePage />} />
      </Routes>
    </Layout>
  );
}

export { Button };
