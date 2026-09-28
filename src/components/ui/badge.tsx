import type { SubmissionStatus } from '@/types/db';

type SeverityVariant = 'crit' | 'risk' | 'pass';

const severityClasses: Record<SeverityVariant, string> = {
  crit: 'bg-crit-bg text-crit-fg border-crit-border',
  risk: 'bg-risk-bg text-risk-fg border-risk-border',
  pass: 'bg-pass-bg text-pass-fg border-pass-border',
};

const severityLabels: Record<SeverityVariant, string> = {
  crit: 'CRIT',
  risk: 'RISK',
  pass: 'PASS',
};

const base =
  'inline-flex items-center rounded-badge border font-mono font-bold text-[11px] leading-none px-1.5 py-1 uppercase tracking-wide';

export type { SeverityVariant };

/** `label` overrides the default CRIT/RISK/PASS text; colors come from `variant`. */
export function SeverityBadge({ variant, label }: { variant: SeverityVariant; label?: string }) {
  return (
    <span className={`${base} ${severityClasses[variant]}`}>
      [{label ?? severityLabels[variant]}]
    </span>
  );
}

const statusMap: Record<
  SubmissionStatus,
  { label: string; className: string }
> = {
  New: {
    label: 'NEW',
    className: 'bg-status-new-bg text-status-new-fg border-status-new-border',
  },
  Scanning: {
    label: 'SCANNING',
    className:
      'bg-status-scanning-bg text-status-scanning-fg border-status-scanning-border',
  },
  'Report Sent': {
    label: 'REPORT SENT',
    className:
      'bg-status-report-bg text-status-report-fg border-status-report-border',
  },
  'Fix-It Sold': {
    label: 'FIX-IT SOLD',
    className:
      'bg-status-sold-bg text-status-sold-fg border-status-sold-border',
  },
  Closed: {
    label: 'CLOSED',
    className:
      'bg-status-closed-bg text-status-closed-fg border-status-closed-border',
  },
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const s = statusMap[status];
  return <span className={`${base} ${s.className}`}>[{s.label}]</span>;
}
