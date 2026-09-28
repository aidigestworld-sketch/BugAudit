-- Revenue-Bug Audit — reconciliation_runs
-- Aggregate-only measurement of Stripe ↔ access drift per audit.
-- Never stores customer ids, emails, or raw CSV rows — only counts.
-- See RLS_PATTERNS.md > reconciliation_runs.

create table if not exists public.reconciliation_runs (
  id                          uuid        primary key default gen_random_uuid(),
  submission_id               uuid        not null
                                          references public.submissions (id) on delete cascade,
  run_at                      timestamptz not null default now(),
  stripe_rows                 int         not null check (stripe_rows >= 0),
  access_rows                 int         not null check (access_rows >= 0),
  matched                     int         not null check (matched >= 0),
  paid_no_access              int         not null check (paid_no_access >= 0),
  access_no_payment           int         not null check (access_no_payment >= 0),
  past_due_with_access        int         not null check (past_due_with_access >= 0),
  unmatched_stripe            int         not null check (unmatched_stripe >= 0),
  unmatched_access            int         not null check (unmatched_access >= 0),
  -- Estimate derived from a mapped amount column; null when none was mapped.
  est_monthly_at_risk_cents   bigint      check (est_monthly_at_risk_cents >= 0),
  note                        text
);

create index if not exists reconciliation_runs_submission_id_idx
  on public.reconciliation_runs (submission_id);
create index if not exists reconciliation_runs_run_at_idx
  on public.reconciliation_runs (run_at desc);

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------
-- Enabled with NO policies: anon and authenticated get zero access.
-- All reads/writes go through the service-role client after requireAdmin().
alter table public.reconciliation_runs enable row level security;
