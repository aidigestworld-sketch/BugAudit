'use client';

import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';

/**
 * Stripe Checkout returns to `/?paid=1` (success_url) or `/?paid=0`
 * (cancel_url). Client-side so the landing page stays statically rendered;
 * must be wrapped in <Suspense>.
 */
export function CheckoutNotice() {
  const paid = useSearchParams().get('paid');

  if (paid === '1') {
    return (
      <div role="status">
        <Card title="checkout complete" className="border-pass-border">
          <p className="text-sm text-pass-fg font-bold">
            Thanks — your fix-it engagement is booked.
          </p>
          <p className="text-sm text-text mt-2">
            Stripe is emailing your receipt. I&apos;ll reach out within 48
            hours at the email you used at checkout to get started.
          </p>
          <p className="text-xs text-subtle mt-2">
            Paid by bank transfer or debit? Those can take a few days to
            clear; I&apos;ll start once they do.
          </p>
        </Card>
      </div>
    );
  }

  if (paid === '0') {
    return (
      <div role="status">
        <Card title="checkout cancelled" className="border-risk-border">
          <p className="text-sm text-risk-fg font-bold">
            Checkout was cancelled — you have not been charged.
          </p>
          <p className="text-sm text-text mt-2">
            Changed your mind or hit a snag? You can{' '}
            <a href="#fix-it" className="text-accent underline">
              start checkout again
            </a>{' '}
            any time.
          </p>
        </Card>
      </div>
    );
  }

  return null;
}
