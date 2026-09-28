import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { serverEnv } from '@/lib/env';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

// Node runtime — Stripe SDK depends on Node crypto for signature verification.
export const runtime = 'nodejs';
// Do not cache; every request must be verified fresh.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const env = serverEnv();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    // Ignore all other event types.
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = (session.customer_email ?? session.customer_details?.email ?? '')
    .trim()
    .toLowerCase();

  if (!email) {
    console.warn('[stripe webhook] no email on session, skipping match', {
      sessionId: session.id,
    });
    return NextResponse.json({ received: true, matched: false });
  }

  const supabase = createSupabaseServiceClient();

  // Case-insensitive email match, most recent submission wins.
  const { data: matches, error: findErr } = await supabase
    .from('submissions')
    .select('id')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1);

  if (findErr) {
    console.error('[stripe webhook] lookup failed', findErr);
    // Return 5xx so Stripe retries.
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }

  const match = matches?.[0];
  if (!match) {
    console.warn('[stripe webhook] no submission matches customer email', {
      sessionId: session.id,
      email,
    });
    // 200 — don't have Stripe retry a non-match forever.
    return NextResponse.json({ received: true, matched: false });
  }

  const { error: updateErr } = await supabase
    .from('submissions')
    .update({
      status: 'Fix-It Sold',
      stripe_session_id: session.id,
    })
    .eq('id', match.id);

  if (updateErr) {
    console.error('[stripe webhook] update failed', updateErr);
    // 5xx → Stripe retries.
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true, matched: true, id: match.id });
}
