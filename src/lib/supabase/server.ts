import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { serverEnv } from '@/lib/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * User-scoped Supabase client for RSC and Server Actions. Reads/writes the
 * session via the Next cookie store. Subject to RLS.
 */
export async function createSupabaseServerClient() {
  const env = serverEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component — cookies are read-only there; ignore.
        }
      },
    },
  });
}
