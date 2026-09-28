'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { startCheckout } from '@/actions/checkout';

export function FixItCta() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await startCheckout();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.href = res.url;
    });
  };

  return (
    <Card title="fix-it engagement — $199">
      <p className="text-sm text-text">
        Got the report and want me to actually fix what I found? Fixed price
        one-time engagement: I turn the findings into merged PRs on your repo.
        Usually 3–7 business days depending on scope.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onClick} disabled={pending} variant="primary">
          {pending ? 'redirecting…' : 'buy fix-it — $199'}
        </Button>
        <span className="text-xs text-subtle">
          secure checkout via Stripe · use the same email as your submission
        </span>
      </div>
      {error ? <p className="text-crit-fg text-xs mt-2">{error}</p> : null}
    </Card>
  );
}
