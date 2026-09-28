# Stripe Setup

Single product: **Fix-It Engagement, $199 USD, one-time payment**. No
subscriptions, no Connect, no multi-currency.

## Environment variables

| Var | Where it lives | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server only | SDK auth (starts `sk_test_` / `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Server only | Signature verification (starts `whsec_`) |
| `STRIPE_PRICE_ID` | Server only | Fix-It price ID (starts `price_`) |
| `NEXT_PUBLIC_SITE_URL` | Public | Base URL used for `success_url` / `cancel_url` |

Never expose the secret key or webhook secret to the client. `STRIPE_PRICE_ID`
is server-only because Checkout Sessions are always created on the server.

## Creating the price (one-time, in Stripe Dashboard)

1. Products → Add product → name "Fix-It Engagement", price **$199 USD**,
   **One time**.
2. Copy the price ID (`price_...`) into `STRIPE_PRICE_ID`.

## Checkout Session pattern

Server Action `src/actions/checkout.ts` creates a session with:

```ts
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
  success_url: `${env.NEXT_PUBLIC_SITE_URL}/?paid=1`,
  cancel_url:  `${env.NEXT_PUBLIC_SITE_URL}/?paid=0`,
  automatic_tax: { enabled: false },
  billing_address_collection: 'auto',
  // customer_email left unset: buyer enters it in Checkout, and we match
  // on it in the webhook (see below).
});
```

Return `session.url` to the client and `window.location.href = url`.

## Webhook pattern

`src/app/api/webhooks/stripe/route.ts`:

1. **Read raw body** (`await req.text()`) — do NOT parse to JSON before
   signature verification.
2. **Verify signature** with `stripe.webhooks.constructEvent(rawBody,
   sigHeader, env.STRIPE_WEBHOOK_SECRET)`. Return `400` on failure.
3. **Handle `checkout.session.completed`** only. Ignore other events
   (return `200`).
4. **Match by `customer_email`** against `submissions.email`
   (case-insensitive, most recent submission wins).
5. On match: `UPDATE submissions SET status = 'Fix-It Sold',
   stripe_session_id = <id> WHERE id = <matched>`.
6. On no match: `console.warn` and return `200` — do NOT fail the webhook,
   we still want Stripe to consider it delivered so it doesn't retry
   forever.
7. On DB write failure: return `500` so Stripe retries (per Stripe's
   exponential-backoff policy, up to 3 days).

## Local testing

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the whsec_... it prints into .env.local as STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed
```

## Idempotency

Stripe may deliver the same event more than once. Our handler is
idempotent because setting `status = 'Fix-It Sold'` a second time is a
no-op. If you add side effects (email, invoice), gate them on
`stripe_session_id IS NULL` before the update.
