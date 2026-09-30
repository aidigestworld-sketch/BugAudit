import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { serverEnv } from '@/lib/env';
import { resend } from '@/lib/resend';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

// Node runtime — Stripe SDK depends on Node crypto for signature verification.
export const runtime = 'nodejs';
// Do not cache; every request must be verified fresh.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
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

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      // `completed` also fires for delayed payment methods (ACH, SEPA, ...)
      // with payment_status 'unpaid'; those settle later via
      // async_payment_succeeded / async_payment_failed.
      if (session.payment_status !== 'paid') {
        console.info('[stripe webhook] session not paid yet, not marking sold', {
          sessionId: session.id,
          type: event.type,
          paymentStatus: session.payment_status,
        });
        return NextResponse.json({ received: true, paid: false });
      }
      return markSold(session);
    }

    case 'checkout.session.async_payment_failed': {
      const session = event.data.object;
      console.warn('[stripe webhook] async payment failed', { sessionId: session.id });
      await notifyAdmin(`[Revenue-Bug Audit] Payment FAILED for ${session.id}`, [
        'A delayed payment for the fix-it engagement failed.',
        'Submission status was left unchanged.',
        '',
        ...sessionLines(session),
      ]);
      return NextResponse.json({ received: true, paid: false });
    }

    default:
      return NextResponse.json({ received: true, ignored: event.type });
  }
}

/**
 * Every paid checkout emails the admin — matched or not, DB healthy or not —
 * so money never arrives without a human hearing about it. On a 5xx Stripe
 * retries, which can repeat the email; duplicates beat silence.
 */
async function markSold(session: Stripe.Checkout.Session): Promise<NextResponse> {
  const { response, matchLine } = await matchAndMarkSold(session);
  await notifyAdmin(`[Revenue-Bug Audit] Payment received for ${session.id}`, [
    'A fix-it engagement checkout was paid.',
    '',
    ...sessionLines(session),
    `Match:    ${matchLine}`,
  ]);
  return response;
}

async function matchAndMarkSold(
  session: Stripe.Checkout.Session,
): Promise<{ response: NextResponse; matchLine: string }> {
  const email = customerEmail(session);
  if (!email) {
    console.warn('[stripe webhook] no email on session, skipping match', {
      sessionId: session.id,
    });
    return {
      response: NextResponse.json({ received: true, matched: false }),
      matchLine: 'NO MATCH (no email on session)',
    };
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
    return {
      response: NextResponse.json({ error: 'lookup failed' }, { status: 500 }),
      matchLine: 'NO MATCH (submission lookup failed; Stripe will retry)',
    };
  }

  const match = matches?.[0];
  if (!match) {
    console.warn('[stripe webhook] no submission matches customer email', {
      sessionId: session.id,
      email,
    });
    // 200 — don't have Stripe retry a non-match forever.
    return {
      response: NextResponse.json({ received: true, matched: false }),
      matchLine: 'NO MATCH',
    };
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
    return {
      response: NextResponse.json({ error: 'update failed' }, { status: 500 }),
      matchLine: `${match.id} (status update FAILED; Stripe will retry)`,
    };
  }

  return {
    response: NextResponse.json({ received: true, matched: true, id: match.id }),
    matchLine: match.id,
  };
}

function customerEmail(session: Stripe.Checkout.Session): string {
  return (session.customer_email ?? session.customer_details?.email ?? '')
    .trim()
    .toLowerCase();
}

function sessionLines(session: Stripe.Checkout.Session): string[] {
  return [
    `Session:  ${session.id}`,
    `Amount:   ${session.amount_total ?? '(unknown)'} ${session.currency?.toUpperCase() ?? ''} (minor units)`,
    `Customer: ${customerEmail(session) || '(no email on session)'}`,
  ];
}

/**
 * Best-effort admin email. Never throws: a Resend outage must not change
 * the webhook's response code (which would make Stripe retry or give up).
 */
async function notifyAdmin(subject: string, lines: string[]): Promise<void> {
  try {
    const env = serverEnv();
    const { error } = await resend().emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: env.ADMIN_EMAIL,
      subject,
      text: [...lines, '', `Open the dashboard: ${env.NEXT_PUBLIC_SITE_URL}/admin`].join('\n'),
    });
    if (error) console.error('[stripe webhook] resend returned error', error);
  } catch (err) {
    console.error('[stripe webhook] resend failed', err);
  }
}
