import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

/**
 * Service-role Supabase client. Bypasses RLS. Only import this from code
 * paths that have already called requireAdmin() (admin actions) or from
 * the Stripe webhook (which is authenticated by signature).
 */
export function createSupabaseServiceClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
