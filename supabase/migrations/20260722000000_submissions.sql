-- Revenue-Bug Audit — submissions table
-- See RLS_PATTERNS.md for the policy rationale.

create extension if not exists "pgcrypto";

create table if not exists public.submissions (
  id                  uuid        primary key default gen_random_uuid(),
  repo_link           text        not null,
  tech_stack          text,
  email               text        not null,
  status              text        not null default 'New'
                                  check (status in (
                                    'New', 'Scanning', 'Report Sent',
                                    'Fix-It Sold', 'Closed'
                                  )),
  internal_note       text,
  stripe_session_id   text,
  created_at          timestamptz not null default now()
);

-- Admin dashboard filters by status and sorts by created_at.
create index if not exists submissions_status_idx     on public.submissions (status);
create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------
alter table public.submissions enable row level security;

-- Anyone (including unauthenticated visitors) can submit a lead.
-- No SELECT / UPDATE / DELETE policies exist for anon or authenticated,
-- so those roles cannot read or modify submissions. Admin operations go
-- through the service-role client, gated by requireAdmin() in application
-- code — see SECURITY_CHECKLIST.md.
drop policy if exists submissions_anon_insert on public.submissions;
create policy submissions_anon_insert
  on public.submissions
  for insert
  to anon, authenticated
  with check (true);
