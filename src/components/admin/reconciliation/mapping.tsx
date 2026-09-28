'use client';

import type { SuggestedMapping } from '@/lib/reconcile/columns';

type Field = { key: keyof SuggestedMapping; label: string; optional?: boolean };

const STRIPE_FIELDS: Field[] = [
  { key: 'stripeCustomerId', label: 'customer id' },
  { key: 'stripeStatus', label: 'subscription status' },
  { key: 'stripeAmount', label: 'amount', optional: true },
  { key: 'stripeInterval', label: 'billing interval (unmapped = monthly)', optional: true },
];

const ACCESS_FIELDS: Field[] = [
  { key: 'accessCustomerId', label: 'stripe customer id' },
  { key: 'accessFlag', label: 'access flag / plan' },
];

const selectClass =
  'w-full rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50';

export function ColumnMapping({
  stripeHeaders,
  accessHeaders,
  mapping,
  onChange,
  disabled,
}: {
  stripeHeaders: string[];
  accessHeaders: string[];
  mapping: SuggestedMapping;
  onChange: (next: SuggestedMapping) => void;
  disabled: boolean;
}) {
  const group = (title: string, fields: Field[], headers: string[]) => (
    <div className="space-y-3">
      <div className="text-xs text-accent font-mono">:: {title}</div>
      {fields.map((f) => (
        <label key={f.key} className="block">
          <span className="block text-xs text-subtle mb-1">
            {f.label}
            {f.optional ? ' (optional)' : ''}
            {!f.optional && !mapping[f.key] ? ' · required' : ''}
          </span>
          <select
            value={mapping[f.key] ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value || null })}
            className={selectClass}
          >
            <option value="">{f.optional ? '— none —' : '— choose column —'}</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {group('stripe columns', STRIPE_FIELDS, stripeHeaders)}
      {group('access columns', ACCESS_FIELDS, accessHeaders)}
    </div>
  );
}
