import 'server-only';
import { Resend } from 'resend';
import { serverEnv } from '@/lib/env';

let cached: Resend | null = null;

export function resend(): Resend {
  if (cached) return cached;
  cached = new Resend(serverEnv().RESEND_API_KEY);
  return cached;
}
