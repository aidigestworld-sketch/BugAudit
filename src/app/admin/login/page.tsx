import { redirect } from 'next/navigation';
import { getAdminEmail } from '@/lib/admin';
import { LoginForm } from './login-form';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Admin login — Revenue-Bug Audit' };

export default async function AdminLoginPage() {
  const already = await getAdminEmail();
  if (already) redirect('/admin');

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Card title="admin login">
          <LoginForm />
        </Card>
        <p className="text-xs text-subtle mt-4 text-center">
          Single-admin dashboard. No public signup.
        </p>
      </div>
    </main>
  );
}
