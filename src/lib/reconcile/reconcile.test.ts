import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import { DEFAULT_POLICY } from './policy';
import type { ColumnMapping, CsvRow } from './types';

const mapping: ColumnMapping = {
  stripeCustomerId: 'customer',
  stripeStatus: 'status',
  stripeAmount: 'amount',
  stripeInterval: null,
  accessCustomerId: 'cid',
  accessFlag: 'plan',
};

const s = (customer: string, status: string, amount = '10.00'): CsvRow => ({ customer, status, amount });
const a = (cid: string, plan: string): CsvRow => ({ cid, plan });

function run(stripeRows: CsvRow[], accessRows: CsvRow[], m: ColumnMapping = mapping) {
  return reconcile({ stripeRows, accessRows, mapping: m });
}

function categoryOf(result: ReturnType<typeof run>, id: string) {
  return result.mismatches.find((r) => r.customerId?.toLowerCase() === id.toLowerCase())?.category ?? 'matched_ok';
}

describe('reconcile', () => {
  it('collapses multiple subscriptions per customer to the best status', () => {
    const r = run(
      [s('cus_1', 'canceled', '50'), s('cus_1', 'active', '20'), s('cus_1', 'past_due', '5')],
      [a('cus_1', 'free')],
    );
    expect(r.stats.multiSubscriptionCustomers).toBe(1);
    expect(r.summary.paid_no_access.count).toBe(1);
    const row = r.mismatches[0];
    expect(row?.stripeStatus).toBe('active');
    expect(row?.subscriptionCount).toBe(3);
    expect(row?.amountCents).toBe(2000); // only grant-class subs are summed
  });

  it('sums concurrent paying subscriptions', () => {
    const r = run([s('cus_1', 'active', '20'), s('cus_1', 'trialing', '15')], [a('cus_1', 'none')]);
    expect(r.summary.paid_no_access.amountCents).toBe(3500);
  });

  it('treats trialing as entitled', () => {
    const r = run([s('cus_t', 'trialing'), s('cus_u', 'trialing')], [a('cus_t', 'pro'), a('cus_u', 'free')]);
    expect(categoryOf(r, 'cus_t')).toBe('matched_ok');
    expect(categoryOf(r, 'cus_u')).toBe('paid_no_access');
  });

  it('puts past_due with access into the warn bucket, not drift', () => {
    const r = run([s('cus_p', 'past_due', '30'), s('cus_q', 'past_due')], [a('cus_p', 'pro'), a('cus_q', 'free')]);
    expect(r.summary.past_due_with_access.count).toBe(1);
    expect(r.summary.past_due_with_access.amountCents).toBe(3000);
    expect(categoryOf(r, 'cus_q')).toBe('matched_ok');
    expect(r.estMonthlyAtRiskCents).toBe(0);
  });

  it('flags access without payment and uses the largest lapsed sub as the estimate', () => {
    const r = run(
      [s('cus_x', 'canceled', '10'), s('cus_x', 'unpaid', '40'), s('cus_y', 'incomplete_expired', '5')],
      [a('cus_x', 'yes'), a('cus_y', 'active')],
    );
    expect(r.summary.access_no_payment.count).toBe(2);
    expect(r.summary.access_no_payment.amountCents).toBe(4500);
    expect(r.estMonthlyAtRiskCents).toBe(4500);
  });

  it('normalizes whitespace and case in ids before joining', () => {
    const r = run([s('  cus_AbC ', 'active')], [a('CUS_abc', 'pro')]);
    expect(r.summary.matched_ok.count).toBe(1);
    expect(r.mismatches).toHaveLength(0);
  });

  it('reports empty ids as missing_identifiers with file and row', () => {
    const r = run([s('', 'active'), s('cus_1', 'active')], [a('   ', 'pro'), a('cus_1', 'pro')]);
    expect(r.summary.missing_identifiers.count).toBe(2);
    expect(r.mismatches.map((m) => m.source)).toEqual([
      { file: 'stripe', row: 1 },
      { file: 'access', row: 1 },
    ]);
    expect(r.summary.missing_identifiers.amountCents).toBeNull();
  });

  it('collapses duplicate access rows, any granting row wins', () => {
    const r = run([s('cus_d', 'active')], [a('cus_d', 'free'), a('cus_d', 'pro'), a('cus_d', 'free')]);
    expect(r.stats.duplicateAccessRows).toBe(2);
    expect(r.stats.accessCustomers).toBe(1);
    expect(r.summary.matched_ok.count).toBe(1);
  });

  it('splits stripe-only customers by status; paying ones are drift', () => {
    const r = run(
      [s('cus_act', 'active', '12'), s('cus_tri', 'trialing', '8'), s('cus_can', 'canceled', '99'), s('cus_pd', 'past_due', '5')],
      [],
    );
    expect(r.summary.stripe_only_paying).toEqual({ count: 2, amountCents: 2000 });
    expect(r.summary.stripe_only_inactive.count).toBe(2); // canceled + past_due
    expect(r.estMonthlyAtRiskCents).toBe(2000);
    expect(r.mismatches.map((m) => m.category)).toEqual([
      'stripe_only_paying',
      'stripe_only_paying',
      'stripe_only_inactive',
      'stripe_only_inactive',
    ]);
  });

  it('splits access-only customers: granted → review, not granted → ignored and unlisted', () => {
    const r = run([], [a('cus_comp', 'lifetime'), a('cus_old', 'free'), a('cus_x', 'false')]);
    expect(r.summary.access_only_review).toEqual({ count: 1, amountCents: null });
    expect(r.summary.access_only_ignored).toEqual({ count: 2, amountCents: null });
    expect(r.mismatches.map((m) => m.customerId)).toEqual(['cus_comp']);
    expect(r.estMonthlyAtRiskCents).toBe(0);
  });

  it('normalizes amounts to monthly when an interval column is mapped', () => {
    const rows = [
      { customer: 'cus_y', status: 'active', amount: '120', every: 'year' },
      { customer: 'cus_q', status: 'active', amount: '30', every: '3 months' },
      { customer: 'cus_m', status: 'active', amount: '10', every: 'month' },
      { customer: 'cus_z', status: 'active', amount: '7', every: 'fortnightly-ish' },
    ];
    const r = run(rows, [], { ...mapping, stripeInterval: 'every' });
    const byId = Object.fromEntries(r.mismatches.map((m) => [m.customerId, m.amountCents]));
    expect(byId).toEqual({ cus_m: 1000, cus_q: 1000, cus_y: 1000, cus_z: 700 });
    expect(r.stats.unrecognizedIntervals).toBe(1);
    expect(r.intervalMapped).toBe(true);
    // Unmapped: taken as monthly.
    expect(run(rows.slice(0, 1), []).summary.stripe_only_paying.amountCents).toBe(12000);
  });

  it('handles empty files', () => {
    const r = run([], []);
    expect(r.mismatches).toEqual([]);
    expect(r.stats.stripeCustomers).toBe(0);
    expect(r.estMonthlyAtRiskCents).toBe(0);
    const onlyStripe = run([s('cus_1', 'active')], []);
    expect(onlyStripe.summary.stripe_only_paying.count).toBe(1);
  });

  it('returns null amounts when no amount column is mapped', () => {
    const r = run([s('cus_1', 'active')], [a('cus_1', 'free')], { ...mapping, stripeAmount: null });
    expect(r.hasAmounts).toBe(false);
    expect(r.summary.paid_no_access.amountCents).toBeNull();
    expect(r.estMonthlyAtRiskCents).toBeNull();
  });

  it('honours a custom policy', () => {
    const r = reconcile({
      stripeRows: [s('cus_1', 'past_due')],
      accessRows: [a('cus_1', 'basic')],
      mapping,
      policy: { ...DEFAULT_POLICY, warn: [], noAccessValues: ['basic'] },
    });
    // past_due now "deny", and "basic" means no access → consistent.
    expect(r.summary.matched_ok.count).toBe(1);
  });

  it('counts unparseable amounts', () => {
    const r = run([s('cus_1', 'active', 'n/a'), s('cus_2', 'active', '')], []);
    expect(r.stats.unparseableAmounts).toBe(1);
  });
});
