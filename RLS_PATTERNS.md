# RLS Patterns

Row-Level Security is the second line of defense. The first is
application-layer authorization (`requireAdmin()` in every admin Server
Action). Never rely on RLS alone.

## Rules

1. **Every table has RLS enabled.** `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
   is mandatory. A table with no policies + RLS on = zero access from the
   `anon` and `authenticated` roles, which is the correct default.
2. **Policies are named and commented.** Format:
   `<table>_<role>_<action>` (e.g. `submissions_anon_insert`).
3. **`anon` role gets the minimum surface.** For this project, only:
   `INSERT` into `submissions`.
4. **Admin reads/writes go through the service-role key**, not user JWTs.
   The service role bypasses RLS, so all admin queries must be preceded
   by an application-layer `requireAdmin()` check.
5. **Never grant `USING (true)` on SELECT / UPDATE / DELETE** without an
   explicit reason and comment.

## `submissions` policies (this project)

```sql
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Public intake form: anyone can create a submission.
CREATE POLICY submissions_anon_insert
  ON submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No SELECT / UPDATE / DELETE policies for anon or authenticated.
-- Admin dashboard uses the service-role client and re-checks the caller
-- against ADMIN_EMAIL in application code before every query.
```

## `reconciliation_runs` policies (this project)

Admin-only / server-written tables (anything the webhook syncs, and
admin-only measurement data like `reconciliation_runs`) get RLS enabled
and **no policies at all**. `anon` and `authenticated` get zero access.
Reads and writes go only through the service-role client after
`requireAdmin()`.

```sql
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
-- No policies. Aggregates only; never holds customer ids or emails.
```

## Verifying RLS locally

After running migrations, connect as `anon` (using the anon key) and
confirm:

- `SELECT * FROM submissions` returns `0 rows` (not an error — RLS
  filters silently).
- `INSERT INTO submissions (repo_link, email) VALUES (...)` succeeds.
- `UPDATE submissions SET status = 'X'` returns `0 rows` affected.

## Adding new tables

1. Create the table.
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` in the same migration.
3. Add explicit policies, or leave with none (locked down).
4. Update this doc with the policies table + rationale.
