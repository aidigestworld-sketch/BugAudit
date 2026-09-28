import type { AccessClass, ReconcilePolicy } from './types';

/**
 * Default entitlement policy.
 *
 * - active / trialing        → should have access
 * - past_due                 → grace period: access tolerated, reported as warning
 * - everything else          → should NOT have access (canceled, unpaid,
 *   incomplete_expired, and — conservatively — incomplete / paused / unknown)
 */
export const DEFAULT_POLICY: ReconcilePolicy = {
  grant: ['active', 'trialing'],
  warn: ['past_due'],
  statusRank: ['active', 'trialing', 'past_due'],
  noAccessValues: ['free', 'none', ''],
};

export function normalizeStatus(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function classifyStatus(status: string, policy: ReconcilePolicy): AccessClass {
  if (policy.grant.includes(status)) return 'grant';
  if (policy.warn.includes(status)) return 'warn';
  return 'deny';
}

/** Lower is better. Unlisted statuses share the worst rank. */
export function statusRank(status: string, policy: ReconcilePolicy): number {
  const i = policy.statusRank.indexOf(status);
  return i === -1 ? policy.statusRank.length : i;
}
