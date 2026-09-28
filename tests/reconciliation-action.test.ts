import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type InsertCall = { table: string; row: unknown };

const h = vi.hoisted(() => ({
  inserts: [] as InsertCall[],
  insertError: null as { code: string } | null,
  requireAdmin: vi.fn(async () => 'admin@example.com'),
}));

vi.mock('@/lib/admin', () => ({ requireAdmin: h.requireAdmin }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        h.inserts.push({ table, row });
        return { error: h.insertError };
      },
    }),
  }),
}));

import { runReconciliation, type ReconcileState } from '@/actions/admin-reconciliation';
import { parseCsv } from '@/lib/reconcile/csv';
import { suggestMapping } from '@/lib/reconcile/columns';
import { buildReportSection } from '@/lib/reconcile/report';
import { driftStats } from '@/lib/reconcile/measurement';
import type { ReconciliationRun, ReconciliationRunInsert } from '@/types/db';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const STRIPE_CSV = fixture('stripe-subscriptions.csv');
const ACCESS_CSV = fixture('client-access.csv');
const SUBMISSION_ID = '5f0c1f7e-7d7b-4a8e-9a55-0d0b3b8f2c11';
const IDLE: ReconcileState = { ok: false, error: null };

/** Turns a captured insert into a full row, as the DB would return it. */
function asRun(i: number): ReconciliationRun {
  const row = h.inserts[i]?.row as ReconciliationRunInsert;
  return { ...row, id: `run-${i}`, run_at: '2026-09-28T00:00:00Z' };
}

function form(opts: { stripe?: Blob; access?: Blob; overrides?: Record<string, string> } = {}) {
  const fd = new FormData();
  fd.set('submissionId', SUBMISSION_ID);
  fd.set('note', 'fixture run');
  fd.set('stripeFile', opts.stripe ?? new Blob([gzipSync(STRIPE_CSV)]), 'stripe.csv.gz');
  fd.set('accessFile', opts.access ?? new Blob([gzipSync(ACCESS_CSV)]), 'access.csv.gz');
  const mapping = {
    stripeCustomerId: 'Customer ID',
    stripeStatus: 'Status',
    stripeAmount: 'Amount',
    stripeInterval: 'Interval',
    accessCustomerId: 'stripe_customer_id',
    accessFlag: 'plan',
    ...opts.overrides,
  };
  for (const [k, v] of Object.entries(mapping)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  h.inserts.length = 0;
  h.insertError = null;
  h.requireAdmin.mockClear();
});

describe('runReconciliation (end-to-end with seeded fixtures)', () => {
  it('produces the exact seeded counts and persists aggregates only', async () => {
    const res = await runReconciliation(IDLE, form());
    expect(h.requireAdmin).toHaveBeenCalledOnce();
    if (!res.ok) throw new Error(`expected ok, got ${res.error}`);

    const s = res.result.summary;
    expect(s.paid_no_access).toEqual({ count: 3, amountCents: 17700 });
    expect(s.access_no_payment).toEqual({ count: 2, amountCents: 6800 });
    expect(s.past_due_with_access).toEqual({ count: 1, amountCents: 4900 });
    // cus_So1 + seeded cus_Sop1 (49/mo) + cus_Sop2 (588/yr → 49/mo)
    expect(s.stripe_only_paying).toEqual({ count: 3, amountCents: 14700 });
    expect(s.stripe_only_inactive.count).toBe(1); // cus_Sin1
    expect(s.access_only_review.count).toBe(2); // cus_Ao1 + seeded cus_Ar1
    expect(s.access_only_ignored.count).toBe(1); // cus_Ai1
    expect(s.missing_identifiers.count).toBe(1);
    expect(s.matched_ok.count).toBe(4); // ok1 (dup rows), ok2, ok3, multi
    // 177 paid_no_access + 147 stripe_only_paying + 68 access_no_payment
    expect(res.result.estMonthlyAtRiskCents).toBe(39200);
    expect(res.result.mismatches.some((m) => m.category === 'access_only_ignored')).toBe(false);
    expect(res.result.stats).toMatchObject({
      stripeRows: 16,
      accessRows: 14,
      multiSubscriptionCustomers: 1,
      duplicateAccessRows: 1,
    });
    expect(res.saved).toBe(true);

    expect(h.inserts).toEqual([
      {
        table: 'reconciliation_runs',
        row: {
          submission_id: SUBMISSION_ID,
          stripe_rows: 16,
          access_rows: 14,
          matched: 4,
          paid_no_access: 3,
          access_no_payment: 2,
          past_due_with_access: 1,
          unmatched_stripe: 4,
          unmatched_access: 3,
          stripe_only_paying: 3,
          stripe_only_inactive: 1,
          access_only_review: 2,
          est_monthly_at_risk_cents: 39200,
          note: 'fixture run',
        },
      },
    ]);
    const persisted = JSON.stringify(h.inserts);
    expect(persisted).not.toMatch(/cus_|@example\.com/i);
  });

  it('assumes monthly amounts when no interval column is mapped', async () => {
    const res = await runReconciliation(IDLE, form({ overrides: { stripeInterval: '' } }));
    if (!res.ok) throw new Error('expected ok');
    expect(res.result.intervalMapped).toBe(false);
    expect(res.result.summary.stripe_only_paying.amountCents).toBe(68600); // 49 + 49 + 588
    expect(res.result.estMonthlyAtRiskCents).toBe(93100);
  });

  it('drift % counts audits whose only drift is paid-but-not-provisioned', async () => {
    const csv = (text: string) => new Blob([gzipSync(text)]);
    const header = 'Customer ID,Status,Amount,Interval\n';
    const access = csv('stripe_customer_id,plan\ncus_B,pro\n');
    // Run 0: full fixture (drift). Run 1: only an active customer missing from
    // the access file. Run 2: clean.
    await runReconciliation(IDLE, form());
    await runReconciliation(IDLE, form({
      stripe: csv(header + 'cus_A,active,10,month\ncus_B,active,10,month\n'),
      access,
    }));
    await runReconciliation(IDLE, form({
      stripe: csv(header + 'cus_B,active,10,month\n'),
      access,
    }));

    const runs = [asRun(0), asRun(1), asRun(2)];
    const r1 = runs[1];
    expect(r1?.paid_no_access).toBe(0);
    expect(r1?.access_no_payment).toBe(0);
    expect(r1?.stripe_only_paying).toBe(1);
    expect(r1?.est_monthly_at_risk_cents).toBe(1000);

    expect(driftStats(runs)).toEqual({
      audits: 3,
      withDrift: 2,
      pct: 67,
      atRiskCents: 39200 + 1000,
      auditsWithAmounts: 3,
    });
  });

  it('report section lists customer ids and never emails', async () => {
    const res = await runReconciliation(IDLE, form());
    if (!res.ok) throw new Error('expected ok');
    const md = buildReportSection(res.result, new Date('2026-09-28T00:00:00Z'));
    expect(md).toContain('`cus_Pna1`, `cus_Pna2`, `cus_Pna3`');
    expect(md).toContain('`cus_Anp1`, `cus_Anp2`');
    expect(md).toContain('`cus_So1`, `cus_Sop1`, `cus_Sop2`');
    expect(md).toContain('`cus_Ao1`, `cus_Ar1`');
    expect(md).not.toContain('cus_Ai1');
    expect(md).toContain('392.00/mo');
    expect(md).toContain('normalized to monthly');
    expect(md).toContain("**What's happening:** 8 customer(s)");
    expect(md).not.toContain('@');
  });

  it('auto-suggests the right columns for the fixtures', () => {
    const st = parseCsv(STRIPE_CSV, 20);
    const ac = parseCsv(ACCESS_CSV, 20);
    expect(
      suggestMapping({ headers: st.headers, sample: st.rows }, { headers: ac.headers, sample: ac.rows }),
    ).toEqual({
      stripeCustomerId: 'Customer ID',
      stripeStatus: 'Status',
      stripeAmount: 'Amount',
      stripeInterval: 'Interval',
      accessCustomerId: 'stripe_customer_id',
      accessFlag: 'plan',
    });
  });

  it('accepts plain (non-gzipped) CSV too', async () => {
    const res = await runReconciliation(
      IDLE,
      form({ stripe: new Blob([STRIPE_CSV]), access: new Blob([ACCESS_CSV]) }),
    );
    expect(res.ok && res.result.summary.paid_no_access.count).toBe(3);
  });

  it('stops at requireAdmin for non-admins', async () => {
    h.requireAdmin.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));
    await expect(runReconciliation(IDLE, form())).rejects.toThrow('NEXT_REDIRECT');
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects files over 5 MB (raw and decompressed)', async () => {
    const big = 'a,b\n' + 'x,y\n'.repeat(1_400_000); // ~5.6 MB
    const raw = await runReconciliation(IDLE, form({ stripe: new Blob([big]) }));
    expect(raw).toEqual({ ok: false, error: 'File exceeds 5 MB.' });
    const bomb = await runReconciliation(IDLE, form({ stripe: new Blob([gzipSync(big)]) }));
    expect(bomb).toEqual({ ok: false, error: 'Stripe file exceeds 5 MB.' });
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects files over the row limit', async () => {
    const many = 'id,status\n' + 'c,active\n'.repeat(50_001);
    const res = await runReconciliation(IDLE, form({ stripe: new Blob([gzipSync(many)]) }));
    expect(res).toEqual({ ok: false, error: 'Each file is limited to 50,000 rows.' });
  });

  it('rejects a mapping that points at a missing column', async () => {
    const res = await runReconciliation(IDLE, form({ overrides: { accessFlag: 'nope' } }));
    expect(res).toEqual({ ok: false, error: 'Access file has no column "nope".' });
  });

  it('rejects invalid input via zod', async () => {
    const fd = form();
    fd.set('submissionId', 'not-a-uuid');
    expect((await runReconciliation(IDLE, fd)).ok).toBe(false);
  });

  it('still returns results when the insert fails, and logs no file content', async () => {
    h.insertError = { code: '42P01' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await runReconciliation(IDLE, form());
    expect(res.ok && res.saved).toBe(false);
    expect(res.ok && res.result.summary.paid_no_access.count).toBe(3);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/cus_|@example/i);
    spy.mockRestore();
  });
});
