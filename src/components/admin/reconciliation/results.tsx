'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { CategoryBadge } from './category-badge';
import { buildReportSection, CATEGORY_LABELS, CATEGORY_NOTES, formatAmount } from '@/lib/reconcile/report';
import {
  CATEGORIES,
  DRIFT_CATEGORIES,
  type Category,
  type ReconcileResult,
} from '@/lib/reconcile/types';

const OTHER_CATEGORIES = CATEGORIES.filter(
  (c) => !DRIFT_CATEGORIES.includes(c) && c !== 'access_only_ignored',
);

const MAX_TABLE_ROWS = 500;

export function ReconciliationResults({
  result,
  malformedRows,
  saved,
}: {
  result: ReconcileResult;
  malformedRows: { stripe: number; access: number };
  saved: boolean;
}) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const { stats, summary, mismatches } = result;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildReportSection(result));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  const notes = [
    `${stats.stripeRows} stripe rows → ${stats.stripeCustomers} customers`,
    `${stats.accessRows} access rows → ${stats.accessCustomers} customers`,
    stats.multiSubscriptionCustomers ? `${stats.multiSubscriptionCustomers} multi-sub customers` : null,
    stats.duplicateAccessRows ? `${stats.duplicateAccessRows} duplicate access rows` : null,
    malformedRows.stripe + malformedRows.access
      ? `${malformedRows.stripe + malformedRows.access} malformed csv rows`
      : null,
    stats.unparseableAmounts ? `${stats.unparseableAmounts} unparseable amounts` : null,
    summary.access_only_ignored.count
      ? `${summary.access_only_ignored.count} no-access/no-stripe rows ignored`
      : null,
    result.hasAmounts && !result.intervalMapped ? 'amounts assumed monthly (no interval column)' : null,
    stats.unrecognizedIntervals ? `${stats.unrecognizedIntervals} unrecognized intervals (assumed monthly)` : null,
    saved ? 'aggregates saved' : 'aggregates NOT saved (see logs)',
  ].filter((n): n is string => n !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-subtle font-mono">// Files processed in memory, not stored.</p>
        <button
          type="button"
          onClick={copy}
          className="text-xs text-subtle hover:text-text font-mono"
        >
          {copied === 'ok' ? '[ copied ]' : copied === 'fail' ? '[ copy failed ]' : '[ copy as report section ]'}
        </button>
      </div>

      {result.estMonthlyAtRiskCents !== null ? (
        <p className="text-sm font-mono text-text">
          est. monthly at risk:{' '}
          <span className="text-crit-fg font-bold">{formatAmount(result.estMonthlyAtRiskCents)}</span>
          <span className="text-subtle text-xs"> /mo (estimate, export currency)</span>
        </p>
      ) : null}

      <div className="text-xs text-accent font-mono">:: drift</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {DRIFT_CATEGORIES.map((c) => <SummaryCard key={c} category={c} result={result} />)}
      </div>
      <div className="text-xs text-accent font-mono">:: not drift</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {OTHER_CATEGORIES.map((c) => <SummaryCard key={c} category={c} result={result} />)}
      </div>

      <p className="text-xs text-subtle font-mono">{notes.join(' · ')}</p>

      {mismatches.length === 0 ? (
        <p className="text-sm text-subtle font-mono">// no mismatches</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs font-mono">
            <thead className="bg-bg/60 text-subtle">
              <tr>
                {['category', 'customer id', 'stripe status', 'subs', 'access', 'est./mo'].map((h) => (
                  <th key={h} className="text-left font-normal px-3 py-2 border-b border-border">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mismatches.slice(0, MAX_TABLE_ROWS).map((r, i) => (
                <tr key={`${r.category}-${r.customerId ?? ''}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2"><CategoryBadge category={r.category} /></td>
                  <td className="px-3 py-2 text-text break-all">
                    {r.customerId ?? (r.source ? `(${r.source.file} row ${r.source.row})` : '—')}
                  </td>
                  <td className="px-3 py-2 text-subtle">{r.stripeStatus ?? '—'}</td>
                  <td className="px-3 py-2 text-subtle">{r.subscriptionCount || '—'}</td>
                  <td className="px-3 py-2 text-subtle">
                    {r.hasAccess === null ? '—' : `${r.hasAccess ? 'yes' : 'no'}${r.accessValue ? ` (${r.accessValue})` : ''}`}
                  </td>
                  <td className="px-3 py-2 text-subtle">
                    {r.amountCents !== null ? formatAmount(r.amountCents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mismatches.length > MAX_TABLE_ROWS ? (
            <p className="px-3 py-2 text-xs text-subtle font-mono">
              // showing {MAX_TABLE_ROWS} of {mismatches.length} mismatched rows
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ category, result }: { category: Category; result: ReconcileResult }) {
  const s = result.summary[category];
  return (
    <Card title={CATEGORY_LABELS[category]}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xl font-mono font-bold text-text">{s.count}</span>
        <CategoryBadge category={category} />
      </div>
      <div className="text-xs text-subtle font-mono mt-1">
        {s.amountCents !== null ? `est. ${formatAmount(s.amountCents)}/mo` : '—'}
      </div>
      <p className="text-[11px] text-subtle mt-2 leading-snug">{CATEGORY_NOTES[category]}</p>
    </Card>
  );
}
