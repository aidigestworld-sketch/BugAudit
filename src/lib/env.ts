import { z } from 'zod';

const serverSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  ADMIN_EMAIL: z.string().email(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_ID: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
});

const clientSchema = serverSchema.pick({
  NEXT_PUBLIC_SITE_URL: true,
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

let cachedServer: ServerEnv | null = null;

/**
 * Server-only env accessor. Throws on the server if anything is missing so
 * misconfiguration surfaces at first use rather than as a runtime NPE deep
 * inside a Server Action.
 */
export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] invalid server env:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid server environment. See logs for missing keys.');
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function clientEnv(): ClientEnv {
  return {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}
