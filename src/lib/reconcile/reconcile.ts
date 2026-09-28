import { normalizeId, parseAccessFlag, parseAmountCents, parseIntervalMonths } from './normalize';
import { DEFAULT_POLICY, classifyStatus, normalizeStatus, statusRank } from './policy';
import {
  CATEGORIES,
  DRIFT_CATEGORIES,
  type AccessClass,
  type Category,
  type CategorySummary,
  type ColumnMapping,
  type CsvRow,
  type ReconcilePolicy,
  type ReconcileResult,
  type ResultRow,
  UNLISTED_CATEGORIES,
} from './types';

type Sub = { status: string; amountCents: number | null };
type StripeCustomer = { displayId: string; subs: Sub[] };
type AccessCustomer = { displayId: string; hasAccess: boolean; value: string; rows: number };

export type ReconcileInput = {
  stripeRows: readonly CsvRow[];
  accessRows: readonly CsvRow[];
  mapping: ColumnMapping;
  policy?: ReconcilePolicy;
};

/**
 * Pure Stripe ↔ access comparison. Joins on the Stripe customer id
 * (normalized), collapses multiple subscriptions per customer to one
 * effective status, and buckets every customer into exactly one category.
 */
export function reconcile({
  stripeRows,
  accessRows,
  mapping,
  policy = DEFAULT_POLICY,
}: ReconcileInput): ReconcileResult {
  const hasAmounts = mapping.stripeAmount !== null;
  const missing: ResultRow[] = [];
  let unparseableAmounts = 0;
  let unrecognizedIntervals = 0;

  const stripe = new Map<string, StripeCustomer>();
  stripeRows.forEach((row, i) => {
    const rawId = row[mapping.stripeCustomerId] ?? '';
    const key = normalizeId(rawId);
    if (!key) {
      missing.push(missingRow('stripe', i + 1));
      return;
    }
    let amountCents: number | null = null;
    if (mapping.stripeAmount !== null) {
      const cell = row[mapping.stripeAmount] ?? '';
      amountCents = parseAmountCents(cell);
      if (amountCents === null && cell.trim() !== '') unparseableAmounts++;
    }
    if (amountCents !== null && mapping.stripeInterval !== null) {
      // Normalize to monthly. Unmapped or unrecognized intervals are assumed monthly.
      const cell = row[mapping.stripeInterval] ?? '';
      const months = parseIntervalMonths(cell);
      if (months === null && cell.trim() !== '') unrecognizedIntervals++;
      if (months !== null) amountCents = Math.round(amountCents / months);
    }
    const sub: Sub = { status: normalizeStatus(row[mapping.stripeStatus] ?? ''), amountCents };
    const existing = stripe.get(key);
    if (existing) existing.subs.push(sub);
    else stripe.set(key, { displayId: rawId.trim(), subs: [sub] });
  });

  const access = new Map<string, AccessCustomer>();
  let duplicateAccessRows = 0;
  accessRows.forEach((row, i) => {
    const rawId = row[mapping.accessCustomerId] ?? '';
    const key = normalizeId(rawId);
    if (!key) {
      missing.push(missingRow('access', i + 1));
      return;
    }
    const value = (row[mapping.accessFlag] ?? '').trim();
    const has = parseAccessFlag(value, policy);
    const existing = access.get(key);
    if (!existing) {
      access.set(key, { displayId: rawId.trim(), hasAccess: has, value, rows: 1 });
      return;
    }
    // Duplicate rows: any granting row means the customer has access.
    duplicateAccessRows++;
    existing.rows++;
    if (has && !existing.hasAccess) {
      existing.hasAccess = true;
      existing.value = value;
    }
  });

  const rows: ResultRow[] = [];
  const keys = new Set<string>([...stripe.keys(), ...access.keys()]);
  for (const key of keys) {
    const s = stripe.get(key);
    const a = access.get(key);
    const eff = s ? effective(s.subs, policy) : null;
    const category = categorize(eff?.cls ?? null, a ? a.hasAccess : null);
    // Amounts only where money is (or was, for access_no_payment) flowing.
    const moneyFlows = eff !== null && (eff.cls !== 'deny' || category === 'access_no_payment');
    rows.push({
      category,
      customerId: s?.displayId ?? a?.displayId ?? key,
      stripeStatus: eff?.status ?? null,
      subscriptionCount: s?.subs.length ?? 0,
      hasAccess: a ? a.hasAccess : null,
      accessValue: a ? a.value : null,
      amountCents: eff && hasAmounts && moneyFlows ? eff.amountCents : null,
    });
  }
  rows.push(...missing);

  const summary = summarize(rows, hasAmounts);
  const estMonthlyAtRiskCents = hasAmounts
    ? DRIFT_CATEGORIES.reduce((sum, c) => sum + (summary[c].amountCents ?? 0), 0)
    : null;

  const order = (c: Category) => CATEGORIES.indexOf(c);
  const mismatches = rows
    .filter((r) => !UNLISTED_CATEGORIES.includes(r.category))
    .sort(
      (x, y) =>
        order(x.category) - order(y.category) ||
        (x.customerId ?? '').localeCompare(y.customerId ?? '') ||
        (x.source?.row ?? 0) - (y.source?.row ?? 0),
    );

  return {
    stats: {
      stripeRows: stripeRows.length,
      accessRows: accessRows.length,
      stripeCustomers: stripe.size,
      accessCustomers: access.size,
      multiSubscriptionCustomers: [...stripe.values()].filter((c) => c.subs.length > 1).length,
      duplicateAccessRows,
      unparseableAmounts,
      unrecognizedIntervals,
    },
    summary,
    mismatches,
    hasAmounts,
    intervalMapped: mapping.stripeInterval !== null,
    estMonthlyAtRiskCents,
  };
}

function effective(subs: Sub[], policy: ReconcilePolicy) {
  let best: Sub | undefined;
  for (const sub of subs) {
    if (!best || statusRank(sub.status, policy) < statusRank(best.status, policy)) best = sub;
  }
  // subs is never empty: a customer entry is created with its first sub.
  const status = best?.status ?? '';
  const cls = classifyStatus(status, policy);
  const sameClass = subs.filter((x) => classifyStatus(x.status, policy) === cls);
  const amounts = sameClass.map((x) => x.amountCents).filter((n): n is number => n !== null);
  // Paying / grace: sum concurrent subscriptions. Not paying: the largest
  // lapsed subscription approximates the lost monthly revenue.
  const amountCents =
    amounts.length === 0 ? null : cls === 'deny' ? Math.max(...amounts) : amounts.reduce((a, b) => a + b, 0);
  return { status, cls, amountCents };
}

function categorize(cls: AccessClass | null, hasAccess: boolean | null): Category {
  if (cls === null) return hasAccess ? 'access_only_review' : 'access_only_ignored';
  // Paid but never provisioned is drift; past_due/deny with no row is history.
  if (hasAccess === null) return cls === 'grant' ? 'stripe_only_paying' : 'stripe_only_inactive';
  if (cls === 'grant') return hasAccess ? 'matched_ok' : 'paid_no_access';
  if (cls === 'warn') return hasAccess ? 'past_due_with_access' : 'matched_ok';
  return hasAccess ? 'access_no_payment' : 'matched_ok';
}

function missingRow(file: 'stripe' | 'access', row: number): ResultRow {
  return {
    category: 'missing_identifiers',
    customerId: null,
    stripeStatus: null,
    subscriptionCount: 0,
    hasAccess: null,
    accessValue: null,
    amountCents: null,
    source: { file, row },
  };
}

function summarize(rows: ResultRow[], hasAmounts: boolean): Record<Category, CategorySummary> {
  const out = Object.fromEntries(
    CATEGORIES.map((c) => [c, { count: 0, amountCents: hasAmounts ? 0 : null }]),
  ) as Record<Category, CategorySummary>;
  for (const r of rows) {
    const bucket = out[r.category];
    bucket.count++;
    if (bucket.amountCents !== null && r.amountCents !== null) bucket.amountCents += r.amountCents;
  }
  // Amounts only come from the Stripe side, so these are never knowable.
  if (hasAmounts) {
    out.access_only_review.amountCents = null;
    out.access_only_ignored.amountCents = null;
    out.missing_identifiers.amountCents = null;
  }
  return out;
}
