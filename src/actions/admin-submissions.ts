'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { SUBMISSION_STATUSES } from '@/types/db';

const UpdateStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(SUBMISSION_STATUSES),
});

const UpdateNoteInput = z.object({
  id: z.string().uuid(),
  note: z.string().max(10_000),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateStatus(
  input: z.infer<typeof UpdateStatusInput>,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = UpdateStatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('submissions')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id);

  if (error) {
    console.error('[updateStatus] failed', error);
    return { ok: false, error: 'Update failed.' };
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function updateNote(
  input: z.infer<typeof UpdateNoteInput>,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = UpdateNoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const trimmed = parsed.data.note.trim();
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('submissions')
    .update({ internal_note: trimmed.length ? trimmed : null })
    .eq('id', parsed.data.id);

  if (error) {
    console.error('[updateNote] failed', error);
    return { ok: false, error: 'Save failed.' };
  }
  revalidatePath('/admin');
  return { ok: true };
}
