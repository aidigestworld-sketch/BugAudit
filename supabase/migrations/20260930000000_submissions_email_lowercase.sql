-- Store submission emails lowercase so the Stripe webhook can match with an
-- exact equality instead of ILIKE (which treats `_` / `%` as wildcards).
-- submitLead lowercases on insert; this backfills old rows and enforces it.
--
-- Apply AFTER the app code that lowercases on insert is deployed, otherwise
-- the check constraint would reject inserts from the old code.

update public.submissions
   set email = lower(trim(email))
 where email <> lower(trim(email));

alter table public.submissions
  drop constraint if exists submissions_email_lowercase;
alter table public.submissions
  add constraint submissions_email_lowercase check (email = lower(email));

-- The webhook looks submissions up by email.
create index if not exists submissions_email_idx on public.submissions (email);
