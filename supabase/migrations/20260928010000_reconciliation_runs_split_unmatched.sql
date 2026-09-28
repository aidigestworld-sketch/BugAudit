-- Revenue-Bug Audit — split unmatched buckets on reconciliation_runs
--
-- stripe_only_paying    active/trialing in Stripe, no access row → counts as drift
-- stripe_only_inactive  any other Stripe status, no access row → noise
-- access_only_review    access granted, no Stripe customer → review, not drift
--
-- unmatched_stripe / unmatched_access stay as the totals. Rows written before
-- this migration get 0 in the new columns (the split wasn't recorded then).
-- Still aggregates only. RLS stays enabled with no policies (deny by default).

alter table public.reconciliation_runs
  add column if not exists stripe_only_paying   int not null default 0
    check (stripe_only_paying >= 0),
  add column if not exists stripe_only_inactive int not null default 0
    check (stripe_only_inactive >= 0),
  add column if not exists access_only_review   int not null default 0
    check (access_only_review >= 0);

-- Re-assert deny-by-default (idempotent; no policies are created).
alter table public.reconciliation_runs enable row level security;
