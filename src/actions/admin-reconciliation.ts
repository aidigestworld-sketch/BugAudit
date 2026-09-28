'use server';

import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { parseCsv } from '@/lib/reconcile/csv';
import { reconcile } from '@/lib/reconcile/reconcile';
import { MAX_FILE_BYTES, MAX_ROWS } from '@/lib/reconcile/limits';
import type { ColumnMapping, ReconcileResult } from '@/lib/reconcile/types';
import type { ReconciliationRunInsert } from '@/types/db';

// Files are processed in memory only. Nothing from the CSVs (rows, customer
// ids, emails) is persisted or logged — only the aggregate counts below.

export type ReconcileState =
  | {
      ok: true;
      result: ReconcileResult;
      malformedRows: { stripe: number; access: number };
      saved: boolean;
    }
  | { ok: false; error: string | null };

const column = z.string().trim().min(1).max(200);
const optionalColumn = z.string().trim().max(200).transform((v) => (v.length ? v : null));
const file = z
  .instanceof(File)
  .refine((f) => f.size > 0, 'File is empty.')
  .refine((f) => f.size <= MAX_FILE_BYTES, 'File exceeds 5 MB.');

const InputSchema = z.object({
  submissionId: z.string().uuid(),
  note: z.string().trim().max(1000).transform((v) => (v.length ? v : null)),
  stripeFile: file,
  accessFile: file,
  mapping: z.object({
    stripeCustomerId: column,
    stripeStatus: column,
    stripeAmount: optionalColumn,
    stripeInterval: optionalColumn,
    accessCustomerId: column,
    accessFlag: column,
  }),
});

class UserError extends Error {}

const GENERIC = 'Something went wrong. Please try again.';

export async function runReconciliation(
  _prev: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  await requireAdmin();

  const str = (k: string) => String(formData.get(k) ?? '');
  const parsed = InputSchema.safeParse({
    submissionId: str('submissionId'),
    note: str('note'),
    stripeFile: formData.get('stripeFile'),
    accessFile: formData.get('accessFile'),
    mapping: {
      stripeCustomerId: str('stripeCustomerId'),
      stripeStatus: str('stripeStatus'),
      stripeAmount: str('stripeAmount'),
      stripeInterval: str('stripeInterval'),
      accessCustomerId: str('accessCustomerId'),
      accessFlag: str('accessFlag'),
    },
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first?.path[0] === 'stripeFile' || first?.path[0] === 'accessFile' ? first.message : null;
    return { ok: false, error: msg ?? 'Invalid input. Check both files and the column mapping.' };
  }
  const { submissionId, note, stripeFile, accessFile } = parsed.data;
  const mapping: ColumnMapping = parsed.data.mapping;

  let result: ReconcileResult;
  let malformedRows: { stripe: number; access: number };
  try {
    const stripe = parseCsv(await readText(stripeFile, 'Stripe'), MAX_ROWS + 1);
    const access = parseCsv(await readText(accessFile, 'Access'), MAX_ROWS + 1);
    if (stripe.rows.length > MAX_ROWS || access.rows.length > MAX_ROWS) {
      throw new UserError(`Each file is limited to ${MAX_ROWS.toLocaleString('en-US')} rows.`);
    }
    requireColumns('Stripe', stripe.headers, [
      mapping.stripeCustomerId,
      mapping.stripeStatus,
      mapping.stripeAmount,
      mapping.stripeInterval,
    ]);
    requireColumns('Access', access.headers, [mapping.accessCustomerId, mapping.accessFlag]);

    result = reconcile({ stripeRows: stripe.rows, accessRows: access.rows, mapping });
    malformedRows = { stripe: stripe.malformedRows, access: access.malformedRows };
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: err.message };
    // Log the error class only — messages from parsers can echo file content.
    console.error('[runReconciliation] processing failed:', err instanceof Error ? err.name : typeof err);
    return { ok: false, error: GENERIC };
  }

  const s = result.summary;
  const run: ReconciliationRunInsert = {
    submission_id: submissionId,
    stripe_rows: result.stats.stripeRows,
    access_rows: result.stats.accessRows,
    matched: s.matched_ok.count,
    paid_no_access: s.paid_no_access.count,
    access_no_payment: s.access_no_payment.count,
    past_due_with_access: s.past_due_with_access.count,
    unmatched_stripe: s.stripe_only_paying.count + s.stripe_only_inactive.count,
    unmatched_access: s.access_only_review.count + s.access_only_ignored.count,
    stripe_only_paying: s.stripe_only_paying.count,
    stripe_only_inactive: s.stripe_only_inactive.count,
    access_only_review: s.access_only_review.count,
    est_monthly_at_risk_cents: result.estMonthlyAtRiskCents,
    note,
  };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from('reconciliation_runs').insert(run);
  if (error) {
    if (error.code === '23503') return { ok: false, error: 'Submission not found.' };
    console.error('[runReconciliation] insert failed:', error.code);
  } else {
    revalidatePath('/admin');
  }
  return { ok: true, result, malformedRows, saved: !error };
}

/** Accepts gzip (what the admin UI sends) or plain UTF-8 text. */
async function readText(f: File, label: string): Promise<string> {
  const buf = Buffer.from(await f.arrayBuffer());
  const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!isGzip) return buf.toString('utf8');
  try {
    return gunzipSync(buf, { maxOutputLength: MAX_FILE_BYTES }).toString('utf8');
  } catch (err) {
    if (err instanceof RangeError) throw new UserError(`${label} file exceeds 5 MB.`);
    throw new UserError(`${label} file could not be read.`);
  }
}

function requireColumns(label: string, headers: string[], cols: (string | null)[]) {
  for (const c of cols) {
    if (c !== null && !headers.includes(c)) {
      throw new UserError(`${label} file has no column "${c}".`);
    }
  }
}
