export const SUBMISSION_STATUSES = [
  'New',
  'Scanning',
  'Report Sent',
  'Fix-It Sold',
  'Closed',
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type Submission = {
  id: string;
  repo_link: string;
  tech_stack: string | null;
  email: string;
  status: SubmissionStatus;
  internal_note: string | null;
  stripe_session_id: string | null;
  created_at: string;
};

export type ReconciliationRun = {
  id: string;
  submission_id: string;
  run_at: string;
  stripe_rows: number;
  access_rows: number;
  matched: number;
  paid_no_access: number;
  access_no_payment: number;
  past_due_with_access: number;
  /** Total Stripe customers with no access row (= stripe_only_paying + stripe_only_inactive). */
  unmatched_stripe: number;
  /** Total access customers with no Stripe customer (review + ignored). */
  unmatched_access: number;
  stripe_only_paying: number;
  stripe_only_inactive: number;
  access_only_review: number;
  est_monthly_at_risk_cents: number | null;
  note: string | null;
};

export type ReconciliationRunInsert = Omit<ReconciliationRun, 'id' | 'run_at'>;

export type SubmissionInsert = {
  repo_link: string;
  tech_stack?: string | null;
  email: string;
};
