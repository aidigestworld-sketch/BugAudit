/** One parsed CSV row, keyed by (trimmed) header. */
export type CsvRow = Record<string, string>;

export type ColumnMapping = {
  stripeCustomerId: string;
  stripeStatus: string;
  /** Optional monthly amount column on the Stripe export (major units, e.g. "49.00"). */
  stripeAmount: string | null;
  /** Optional billing interval column ("month", "year", "3 months"). Unmapped = assume monthly. */
  stripeInterval: string | null;
  accessCustomerId: string;
  /** Boolean-ish flag ("true", "yes", "active") or a plan name ("pro", "free"). */
  accessFlag: string;
};

export type AccessClass = 'grant' | 'warn' | 'deny';

export type ReconcilePolicy = {
  /** Stripe statuses that should have access. */
  grant: readonly string[];
  /** Grace-period statuses: access is tolerated, reported as a warning. */
  warn: readonly string[];
  /**
   * Collapse ranking when a customer has several subscriptions; earlier wins.
   * Statuses not listed rank below every listed one.
   */
  statusRank: readonly string[];
  /** Access-column values that mean "no access" (compared lowercase, trimmed). */
  noAccessValues: readonly string[];
};

export const CATEGORIES = [
  'paid_no_access',
  /** In Stripe with active/trialing status, no access row: paid, never provisioned. */
  'stripe_only_paying',
  'access_no_payment',
  'past_due_with_access',
  /** In Stripe with a non-entitled status, no access row: churned history, noise. */
  'stripe_only_inactive',
  /** Access granted, no Stripe customer: comps, manual grants, off-Stripe payments. Review, not drift. */
  'access_only_review',
  /** No access and no Stripe customer: noise, counted but not listed. */
  'access_only_ignored',
  'missing_identifiers',
  'matched_ok',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Categories that count as billing ↔ access drift for the measurement. */
export const DRIFT_CATEGORIES: readonly Category[] = [
  'paid_no_access',
  'stripe_only_paying',
  'access_no_payment',
];

/** Categories left out of the mismatch table (counted in the summary only). */
export const UNLISTED_CATEGORIES: readonly Category[] = ['matched_ok', 'access_only_ignored'];

export type ResultRow = {
  category: Category;
  /** Display id (trimmed, original case). Null only for missing_identifiers. */
  customerId: string | null;
  /** Collapsed effective Stripe status, null when the customer isn't in Stripe. */
  stripeStatus: string | null;
  subscriptionCount: number;
  /** Parsed access, null when the customer isn't in the access file. */
  hasAccess: boolean | null;
  /** Raw access cell as found (plan name / flag), for the table. */
  accessValue: string | null;
  /** Estimated monthly amount in cents, null when unknown. */
  amountCents: number | null;
  /** For missing_identifiers: which file and 1-based data row. */
  source?: { file: 'stripe' | 'access'; row: number };
};

export type CategorySummary = { count: number; amountCents: number | null };

export type ReconcileResult = {
  stats: {
    stripeRows: number;
    accessRows: number;
    stripeCustomers: number;
    accessCustomers: number;
    multiSubscriptionCustomers: number;
    duplicateAccessRows: number;
    unparseableAmounts: number;
    /** Non-empty interval cells that weren't understood (treated as monthly). */
    unrecognizedIntervals: number;
  };
  summary: Record<Category, CategorySummary>;
  /** Every row not in UNLISTED_CATEGORIES. */
  mismatches: ResultRow[];
  hasAmounts: boolean;
  /** True when amounts were normalized to monthly via a mapped interval column. */
  intervalMapped: boolean;
  /** Estimate: sum over DRIFT_CATEGORIES. Null when no amount column mapped. */
  estMonthlyAtRiskCents: number | null;
};
