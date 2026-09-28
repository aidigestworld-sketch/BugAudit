'use server';

import { stripe } from '@/lib/stripe';
import { serverEnv } from '@/lib/env';

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function startCheckout(): Promise<CheckoutResult> {
  try {
    const env = serverEnv();
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${env.NEXT_PUBLIC_SITE_URL}/?paid=1`,
      cancel_url: `${env.NEXT_PUBLIC_SITE_URL}/?paid=0`,
      automatic_tax: { enabled: false },
      billing_address_collection: 'auto',
    });

    if (!session.url) {
      console.error('[startCheckout] session has no url', { id: session.id });
      return { ok: false, error: 'Could not start checkout. Please try again.' };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    console.error('[startCheckout] failed', err);
    return { ok: false, error: 'Could not start checkout. Please try again.' };
  }
}
