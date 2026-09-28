import { Card } from '@/components/ui/card';
import { formatAmount } from '@/lib/reconcile/report';
import { driftStats } from '@/lib/reconcile/measurement';
import type { ReconciliationRun } from '@/types/db';

/**
 * Hypothesis read-out across audits: how often does billing ↔ access drift
 * exist, and how much money does it represent? Uses the latest run per
 * submission so re-runs of the same audit don't double count.
 */
export function ReconciliationOverview({
  totalRuns,
  latestPerSubmission,
}: {
  totalRuns: number;
  latestPerSubmission: ReconciliationRun[];
}) {
  const { audits, withDrift, pct, atRiskCents, auditsWithAmounts } = driftStats(latestPerSubmission);

  const stat = (label: string, value: string, hint?: string) => (
    <div>
      <div className="text-xs text-subtle">{label}</div>
      <div className="text-2xl font-mono font-bold text-text">{value}</div>
      {hint ? <div className="text-xs text-subtle font-mono">{hint}</div> : null}
    </div>
  );

  return (
    <Card title="reconciliation · all audits" right={<span>aggregates only</span>}>
      {audits === 0 ? (
        <p className="text-sm text-subtle font-mono">// no reconciliation runs yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stat('audits reconciled', String(audits), `${totalRuns} total runs`)}
          {stat('audits with drift', `${pct}%`, `${withDrift} of ${audits} (paid/no access, paid/no access row, or access/not paying)`)}
          {stat(
            'est. monthly at risk',
            formatAmount(atRiskCents),
            `estimate · ${auditsWithAmounts} of ${audits} audits had an amount column`,
          )}
        </div>
      )}
    </Card>
  );
}
