import type { ReactNode } from 'react';

// Auth gating happens per-page (see /admin/page.tsx and /admin/login/page.tsx)
// so the login screen can render without redirect loops.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
