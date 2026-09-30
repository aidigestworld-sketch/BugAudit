'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';
import { serverEnv } from '@/lib/env';
import type { SubmissionInsert } from '@/types/db';

const InputSchema = z.object({
  repo_link: z
    .string()
    .trim()
    .min(1, 'Please share a link to the repo or service.')
    .max(500)
    .refine(
      (v) => /^(https?:\/\/|git@)/.test(v),
      'Should look like a URL or a git SSH address.',
    ),
  tech_stack: z.string().trim().max(300).optional().nullable(),
  email: z.string().trim().email('That email doesn’t look right.').max(320),
});

export type SubmitState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

export async function submitLead(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const raw = {
    repo_link: String(formData.get('repo_link') ?? ''),
    tech_stack: (formData.get('tech_stack') ?? '') as string,
    email: String(formData.get('email') ?? ''),
  };

  const parsed = InputSchema.safeParse({
    ...raw,
    tech_stack: raw.tech_stack.length ? raw.tech_stack : null,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (msgs && msgs.length) fieldErrors[key] = msgs[0]!;
    }
    return {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors,
    };
  }

  // RLS allows anon INSERT but deliberately no SELECT, so do NOT chain
  // .select()/.single() here: INSERT ... RETURNING needs SELECT permission
  // and fails with 42501. Generate the id ourselves instead.
  const id = randomUUID();
  const row: SubmissionInsert = {
    id,
    repo_link: parsed.data.repo_link,
    tech_stack: parsed.data.tech_stack ?? null,
    email: parsed.data.email,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('submissions').insert(row);

  if (error) {
    console.error('[submitLead] insert failed', error);
    return {
      status: 'error',
      message: 'Something went wrong saving your submission. Please try again.',
    };
  }

  // Fire-and-log the notification email. A Resend failure should NOT block
  // the confirmation to the user — the lead is already saved.
  try {
    const env = serverEnv();
    await resend().emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: env.ADMIN_EMAIL,
      subject: `[Revenue-Bug Audit] New submission from ${parsed.data.email}`,
      text: [
        `New submission received.`,
        ``,
        `Repo:  ${parsed.data.repo_link}`,
        `Stack: ${parsed.data.tech_stack ?? '(not provided)'}`,
        `Email: ${parsed.data.email}`,
        ``,
        `Submission id: ${id}`,
        `Open the dashboard: ${env.NEXT_PUBLIC_SITE_URL}/admin`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[submitLead] resend failed', err);
  }

  return { status: 'ok' };
}
