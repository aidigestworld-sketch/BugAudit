import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

/**
 * Returns the admin user's email if the current session belongs to the
 * ADMIN_EMAIL account. Returns null otherwise. Does not redirect.
 */
export async function getAdminEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? null;
  const adminEmail = serverEnv().ADMIN_EMAIL.toLowerCase();
  return email && email === adminEmail ? email : null;
}

/**
 * Blocks non-admin callers. In RSCs it redirects to /admin/login. In
 * Server Actions callers should also handle the redirect (Next re-throws
 * the redirect signal cleanly).
 */
export async function requireAdmin(): Promise<string> {
  const email = await getAdminEmail();
  if (!email) redirect('/admin/login');
  return email;
}
