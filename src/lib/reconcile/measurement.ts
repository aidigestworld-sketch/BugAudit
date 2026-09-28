import type { ReconciliationRun } from '@/types/db';

type DriftFields = Pick<ReconciliationRun, 'paid_no_access' | 'stripe_only_paying' | 'access_no_payment'>;

/** Drift = paid_no_access + stripe_only_paying + access_no_payment (see DRIFT_CATEGORIES). */
export function driftCount(run: DriftFields): number {
  return run.paid_no_access + run.stripe_only_paying + run.access_no_payment;
}

export type DriftStats = {
  audits: number;
  withDrift: number;
  /** 0–100, rounded. */
  pct: number;
  atRiskCents: number;
  auditsWithAmounts: number;
};

/**
 * Hypothesis read-out across audits. Pass the latest run per submission so
 * re-runs of the same audit don't double count.
 */
export function driftStats(
  runs: readonly (DriftFields & Pick<ReconciliationRun, 'est_monthly_at_risk_cents'>)[],
): DriftStats {
  const audits = runs.length;
  const withDrift = runs.filter((r) => driftCount(r) > 0).length;
  return {
    audits,
    withDrift,
    pct: audits ? Math.round((withDrift / audits) * 100) : 0,
    atRiskCents: runs.reduce((sum, r) => sum + (r.est_monthly_at_risk_cents ?? 0), 0),
    auditsWithAmounts: runs.filter((r) => r.est_monthly_at_risk_cents !== null).length,
  };
}
