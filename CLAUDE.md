# Revenue-Bug Audit — Project Conventions

A one-person lead-intake service for codebase audits. Public landing page
takes submissions; admin dashboard triages them; Stripe checkout sells the
$199 fix-it engagement.

## Stack

- **Framework**: Next.js 15+ App Router, TypeScript (strict), React Server
  Components + Server Actions.
- **Data**: Supabase (Postgres + Auth + RLS). Migrations in `supabase/migrations/`.
- **Payments**: Stripe Checkout + webhooks. See `STRIPE_SETUP.md`.
- **Email**: Resend for admin notifications.
- **Styling**: Tailwind CSS with a dark terminal palette (see `tailwind.config.ts`).
- **Runtime target**: Vercel Fluid Compute (Node.js). No Edge runtime.

## TypeScript rules

- `strict: true`. No `any`. No `as unknown as X` shortcuts.
- Prefer `type` over `interface` for data shapes; `interface` only for
  extensible public contracts.
- All Server Action inputs validated with **zod**; parse `FormData` into a
  typed object before touching the DB.
- Database row types come from `src/types/db.ts` (hand-maintained; regenerate
  from Supabase later if desired).

## Server Actions

- Live in `src/actions/*.ts`. First line `"use server"`.
- Signature: `(prev: State, formData: FormData) => Promise<State>` for
  form-bound actions; `(input: Zod.infer<...>) => Promise<Result>` for
  imperative calls.
- Every admin action re-checks `requireAdmin()` — do **not** rely on RLS
  alone (see `SECURITY_CHECKLIST.md`).
- Return `{ ok: true, ...data }` or `{ ok: false, error: string }`. Never
  throw across the RSC boundary for user-facing errors; throw only for
  programmer errors (bad env, unreachable branches).
- `revalidatePath('/admin')` after any mutation the admin views.

## Errors

- User-facing messages are short and neutral ("Something went wrong.
  Please try again."). Detailed errors go to `console.error` (captured by
  Vercel logs), never to the response body.
- Never expose Supabase / Stripe error strings to end users.

## File layout

```
src/
  app/                     Next.js routes (RSC by default)
    api/webhooks/stripe/   Stripe webhook (Node runtime, no body parsing)
    admin/                 Gated dashboard + login
  actions/                 Server Actions
  components/              UI (client components marked with 'use client')
    ui/                    Design-system primitives (Card, Badge, Button)
    landing/               Landing-page sections
    admin/                 Dashboard sections
  lib/
    supabase/              browser / server / service-role clients
    stripe.ts              Stripe SDK singleton
    resend.ts              Resend SDK singleton
    env.ts                 Zod-validated env access
    admin.ts               requireAdmin() helper
  types/
    db.ts                  Row / Insert / Update types for each table
supabase/migrations/       Idempotent SQL migrations
```

## Environment variables

All env access goes through `src/lib/env.ts`. Never `process.env.FOO`
directly in feature code — it strips zod validation and makes typos silent.
See `.env.example` for the full list.

## Design system

Dark terminal aesthetic. Do not introduce new colors, radii, or fonts
without updating `tailwind.config.ts` and this doc. All cards use the
`Card` primitive with a `::`-prefixed header. Badges use the `Badge`
primitive with a `variant` prop — no ad-hoc badge markup.

## What not to build

- No public signup. Admin is a single account, provisioned manually in
  Supabase Auth.
- No user-facing account portal, no submission-status page, no submission
  editing. This is a one-way lead intake.
- No analytics, cookies, or trackers beyond what Vercel provides by
  default.
