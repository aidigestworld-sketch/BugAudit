import { DRIFT_CATEGORIES, type Category, type ReconcileResult } from './types';

export const CATEGORY_LABELS: Record<Category, string> = {
  paid_no_access: 'paid, no access',
  access_no_payment: 'access, not paying',
  past_due_with_access: 'past due, has access',
  stripe_only_paying: 'paid, no access row',
  stripe_only_inactive: 'inactive, no access row',
  access_only_review: 'access, no stripe — review',
  access_only_ignored: 'no access, no stripe',
  missing_identifiers: 'missing ids',
  matched_ok: 'matched ok',
};

/** One-line explanation per category, shared by the UI and the report. */
export const CATEGORY_NOTES: Record<Category, string> = {
  paid_no_access: 'paying in Stripe, access row says no access — drift',
  access_no_payment: 'access granted, Stripe status is not paying — drift',
  past_due_with_access: 'grace period — warning, not drift',
  stripe_only_paying: 'active/trialing in Stripe, never provisioned (e.g. dropped webhook) — drift',
  stripe_only_inactive: 'churned/inactive Stripe customer with no access row — noise, not drift',
  access_only_review:
    'access granted with no Stripe customer — often legit (comps, manual grants, lifetime deals, off-Stripe payments); review, not drift',
  access_only_ignored: 'no access and no Stripe customer — noise',
  missing_identifiers: 'rows with an empty customer id',
  matched_ok: 'billing and access agree',
};

/** Cents → "1,234.56". Currency is whatever the export used. */
export function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MAX_IDS_PER_CATEGORY = 100;

function idList(result: ReconcileResult, category: Category): string {
  const ids = result.mismatches
    .filter((r) => r.category === category && r.customerId !== null)
    .map((r) => `\`${r.customerId}\``);
  if (ids.length === 0) return '_none_';
  const shown = ids.slice(0, MAX_IDS_PER_CATEGORY).join(', ');
  const rest = ids.length - MAX_IDS_PER_CATEGORY;
  return rest > 0 ? `${shown}, …and ${rest} more` : shown;
}

function line(result: ReconcileResult, category: Category, withIds: boolean): string[] {
  const s = result.summary[category];
  const money = s.amountCents !== null ? ` — est. ${formatAmount(s.amountCents)}/mo` : '';
  const head = `- **${CATEGORY_LABELS[category]}**: ${s.count} customer(s)${money} _(${CATEGORY_NOTES[category]})_`;
  return withIds && s.count > 0 ? [head, `  - ${idList(result, category)}`] : [head];
}

/**
 * Markdown finding block for the audit report: where / what's happening /
 * business impact / how confirmed. Contains customer ids only — never emails.
 */
export function buildReportSection(result: ReconcileResult, runDate: Date = new Date()): string {
  const { summary, stats } = result;
  const drift = DRIFT_CATEGORIES.reduce((n, c) => n + summary[c].count, 0);
  const date = runDate.toISOString().slice(0, 10);

  const interval = result.intervalMapped
    ? 'normalized to monthly using the billing-interval column'
    : 'assumed to be monthly (no billing-interval column was mapped)';
  const impact = result.estMonthlyAtRiskCents !== null
    ? `Estimated monthly revenue at risk: **${formatAmount(result.estMonthlyAtRiskCents)}/mo** ` +
      `(estimate — paid-but-not-provisioned customers are likely churn/refund/chargeback risk; ` +
      `access-not-paying customers are unbilled usage). Amounts come from the Stripe export's ` +
      `amount column in its own currency and are ${interval}.`
    : 'No amount column was provided, so revenue impact is not quantified.';

  return [
    `### Finding: Stripe billing and product access are out of sync`,
    ``,
    `**Where:** Subscription state in Stripe vs. the access/entitlement records in the application database.`,
    ``,
    `**What's happening:** ${drift} customer(s) have billing and access that disagree.`,
    ...line(result, 'paid_no_access', true),
    ...line(result, 'stripe_only_paying', true),
    ...line(result, 'access_no_payment', true),
    ``,
    `Not counted as drift:`,
    ...line(result, 'past_due_with_access', true),
    ...line(result, 'access_only_review', true),
    ...line(result, 'stripe_only_inactive', false),
    `- **rows missing a customer id**: ${summary.missing_identifiers.count}`,
    ``,
    `**Business impact:** ${impact}`,
    ``,
    `**How confirmed:** On ${date}, a Stripe subscriptions export (${stats.stripeRows} rows, ` +
      `${stats.stripeCustomers} customers) was joined to the application's access export ` +
      `(${stats.accessRows} rows, ${stats.accessCustomers} customers) on Stripe customer id ` +
      `(trimmed, case-insensitive). Customers with multiple subscriptions ` +
      `(${stats.multiSubscriptionCustomers}) were collapsed to their best status ` +
      `(active/trialing > past_due > other). Policy: active/trialing should have access; ` +
      `past_due is a grace period; all other statuses should not.`,
  ].join('\n');
}
