'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

const LoginInput = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type LoginState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginInput.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Enter a valid email and password.' };
  }

  const adminEmail = serverEnv().ADMIN_EMAIL.toLowerCase();
  if (parsed.data.email.toLowerCase() !== adminEmail) {
    // Do not leak whether the email exists — treat non-admin as bad creds.
    return { status: 'error', message: 'Invalid email or password.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    console.error('[signIn] failed', error.message);
    return { status: 'error', message: 'Invalid email or password.' };
  }

  redirect('/admin');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
