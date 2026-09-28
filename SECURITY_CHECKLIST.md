# Security Checklist

Run this checklist before any deploy that touches auth, data access, or
payments.

## Secrets

- [ ] `.env.local` is gitignored (verify `git check-ignore .env.local`).
- [ ] No secret key appears in any file matched by
      `git grep -E "sk_(live|test)_|whsec_|service_role"`.
- [ ] `NEXT_PUBLIC_*` env vars contain nothing sensitive — they are
      inlined into the client bundle.
- [ ] Production secrets set in Vercel project settings, not committed.

## Authentication

- [ ] Only the `ADMIN_EMAIL` account exists in Supabase Auth (no public
      signup route exists).
- [ ] Admin account has a strong password (or SSO / MFA) — this is the
      single credential guarding all reads.
- [ ] `requireAdmin()` is called at the top of **every** admin Server
      Action and admin route handler. Grep to verify:
      `grep -R "'use server'" src/actions/admin* | wc -l` should equal
      `grep -R "requireAdmin" src/actions/admin* | wc -l`.

## Authorization / RLS

- [ ] `submissions` has `ENABLE ROW LEVEL SECURITY`.
- [ ] The only anon-facing policy is `INSERT`.
- [ ] The service-role client is imported only from `src/lib/supabase/service.ts`
      and only used inside `requireAdmin()`-guarded code paths or the
      Stripe webhook.

## Input validation

- [ ] Every Server Action parses inputs with `zod` before doing anything
      else. `.email()`, `.url()`, `.min()/.max()` where appropriate.
- [ ] Server Actions never trust hidden form fields to determine
      authorization (e.g. don't accept `?admin=1`). Authorization
      derives from the session cookie only.

## Stripe webhook

- [ ] Route reads raw body via `req.text()` before verification.
- [ ] Signature is verified with `stripe.webhooks.constructEvent`. On
      failure, return `400` and do not touch the DB.
- [ ] Only whitelisted event types (`checkout.session.completed`) are
      handled. Others return `200`.
- [ ] Handler is idempotent (see `STRIPE_SETUP.md`).
- [ ] DB write failures return `5xx` so Stripe retries.

## Error handling

- [ ] No Supabase / Stripe / Resend error strings are returned to the
      client. Use generic user-facing messages; log details to
      `console.error`.
- [ ] No `console.log` of user-submitted content that might contain
      credentials (repo URLs sometimes have tokens in them — strip or
      just log the host).

## Rate limiting (future)

Not implemented in v1. The intake form is public and unrated. If we see
abuse, add Upstash rate limit keyed on IP before shipping to more
traffic.
