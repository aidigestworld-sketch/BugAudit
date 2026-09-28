import { SeverityBadge } from '@/components/ui/badge';
import { formatAmount } from '@/lib/reconcile/report';
import { driftCount } from '@/lib/reconcile/measurement';
import type { ReconciliationRun } from '@/types/db';

/** One-line aggregate of the most recent reconciliation for a submission. */
export function LatestRunSummary({ run }: { run: ReconciliationRun }) {
  const drift = driftCount(run);
  const parts = [
    `${run.paid_no_access} paid/no access`,
    `${run.stripe_only_paying} paid/no access row`,
    `${run.access_no_payment} access/not paying`,
    `${run.past_due_with_access} past due`,
    `${run.access_only_review} access/no stripe (review)`,
    `${run.stripe_only_inactive} inactive/no row`,
    `${run.matched} ok`,
    run.est_monthly_at_risk_cents !== null
      ? `est. ${formatAmount(run.est_monthly_at_risk_cents)}/mo at risk`
      : null,
  ].filter((p): p is string => p !== null);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
      <SeverityBadge variant={drift > 0 ? 'crit' : 'pass'} label={drift > 0 ? 'drift' : 'no drift'} />
      <span className="text-subtle">
        last run {new Date(run.run_at).toLocaleString()} · {parts.join(' · ')}
      </span>
    </div>
  );
}
