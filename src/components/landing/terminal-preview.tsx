import { Card } from '@/components/ui/card';
import { SeverityBadge } from '@/components/ui/badge';

type Row = {
  severity: 'crit' | 'risk' | 'pass';
  path: string;
  finding: string;
};

const SAMPLE_ROWS: Row[] = [
  {
    severity: 'crit',
    path: 'app/api/checkout/route.ts:42',
    finding:
      'Stripe webhook secret never verified — anyone can POST checkout events.',
  },
  {
    severity: 'crit',
    path: 'lib/db.ts:118',
    finding:
      'Trial-end job forgets to downgrade — paying users stuck on free plan.',
  },
  {
    severity: 'risk',
    path: 'app/(auth)/login/actions.ts:73',
    finding:
      'Rate limiter keyed on email only — trivial to brute-force from 1 IP.',
  },
  {
    severity: 'risk',
    path: 'workers/email.ts:29',
    finding:
      'Resend retries on 5xx but not on 429 — silent bounces on high volume.',
  },
  {
    severity: 'pass',
    path: 'middleware.ts:1',
    finding: 'Session cookie is HttpOnly, Secure, SameSite=Lax. Good.',
  },
];

export function TerminalPreview() {
  return (
    <Card
      title="scan.example.com — sample findings"
      right={<span className="text-subtle">// demo output, not a live scan</span>}
    >
      <div className="space-y-2 text-sm">
        <pre className="text-subtle text-xs whitespace-pre-wrap">
{`$ audit --repo ./saas-app --focus revenue,security
scanning 4,812 files ... done in 27.3s
5 findings (2 CRIT, 2 RISK, 1 PASS)`}
        </pre>
        <div className="border-t border-border my-3" />
        <ul className="space-y-3">
          {SAMPLE_ROWS.map((row, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="pt-0.5 shrink-0">
                <SeverityBadge variant={row.severity} />
              </span>
              <div className="min-w-0">
                <div className="text-accent text-xs truncate">{row.path}</div>
                <div className="text-text text-sm">{row.finding}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
