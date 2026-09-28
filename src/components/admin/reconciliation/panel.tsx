'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { runReconciliation, type ReconcileState } from '@/actions/admin-reconciliation';
import { parseCsv } from '@/lib/reconcile/csv';
import { suggestMapping, type SuggestedMapping } from '@/lib/reconcile/columns';
import { MAX_FILE_BYTES, MAX_UPLOAD_BYTES } from '@/lib/reconcile/limits';
import type { CsvRow } from '@/lib/reconcile/types';
import { ColumnMapping } from './mapping';
import { ReconciliationResults } from './results';

type Preview = { file: File; headers: string[]; sample: CsvRow[] };

const EMPTY_MAPPING: SuggestedMapping = {
  stripeCustomerId: null,
  stripeStatus: null,
  stripeAmount: null,
  stripeInterval: null,
  accessCustomerId: null,
  accessFlag: null,
};

/** Reads just the head of the file locally to get headers + sample rows. */
async function preview(file: File): Promise<Preview> {
  const head = await file.slice(0, 64 * 1024).text();
  const { headers, rows } = parseCsv(head, 20);
  return { file, headers, sample: rows };
}

async function gzip(file: File): Promise<Blob> {
  return new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

const fileInputClass =
  'block w-full text-xs font-mono text-subtle file:mr-3 file:rounded-md file:border file:border-border file:bg-raised file:text-text file:px-3 file:py-1.5 file:font-mono';

export function ReconciliationPanel({ submissionId }: { submissionId: string }) {
  const [stripe, setStripe] = useState<Preview | null>(null);
  const [access, setAccess] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<SuggestedMapping>(EMPTY_MAPPING);
  const [note, setNote] = useState('');
  const [state, setState] = useState<ReconcileState>({ ok: false, error: null });
  const [clientError, setClientError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onPick = async (side: 'stripe' | 'access', file: File | undefined) => {
    setClientError(null);
    setState({ ok: false, error: null });
    if (!file) return side === 'stripe' ? setStripe(null) : setAccess(null);
    if (file.size > MAX_FILE_BYTES) {
      setClientError(`${file.name} exceeds 5 MB.`);
      return;
    }
    const p = await preview(file);
    const nextStripe = side === 'stripe' ? p : stripe;
    const nextAccess = side === 'access' ? p : access;
    if (side === 'stripe') setStripe(p);
    else setAccess(p);
    if (nextStripe && nextAccess) setMapping(suggestMapping(nextStripe, nextAccess));
  };

  const ready =
    stripe && access && mapping.stripeCustomerId && mapping.stripeStatus &&
    mapping.accessCustomerId && mapping.accessFlag;

  const run = () => {
    if (!stripe || !access) return;
    setClientError(null);
    startTransition(async () => {
      const [s, a] = await Promise.all([gzip(stripe.file), gzip(access.file)]);
      if (s.size + a.size > MAX_UPLOAD_BYTES) {
        setClientError('Files are too large to upload together, even compressed.');
        return;
      }
      const fd = new FormData();
      fd.set('submissionId', submissionId);
      fd.set('note', note);
      fd.set('stripeFile', s, 'stripe.csv.gz');
      fd.set('accessFile', a, 'access.csv.gz');
      for (const [k, v] of Object.entries(mapping)) fd.set(k, v ?? '');
      setState(await runReconciliation(state, fd));
    });
  };

  const error = clientError ?? (!state.ok ? state.error : null);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-xs text-subtle mb-1">stripe subscriptions csv</span>
          <input type="file" accept=".csv,text/csv" disabled={pending}
            onChange={(e) => void onPick('stripe', e.target.files?.[0])} className={fileInputClass} />
        </label>
        <label className="block">
          <span className="block text-xs text-subtle mb-1">client access csv</span>
          <input type="file" accept=".csv,text/csv" disabled={pending}
            onChange={(e) => void onPick('access', e.target.files?.[0])} className={fileInputClass} />
        </label>
      </div>

      {stripe && access ? (
        <>
          <ColumnMapping
            stripeHeaders={stripe.headers}
            accessHeaders={access.headers}
            mapping={mapping}
            onChange={setMapping}
            disabled={pending}
          />
          <label className="block">
            <span className="block text-xs text-subtle mb-1">run note (optional, stored)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="e.g. prod export 2026-09-28 — no customer data here"
              className="w-full rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={run} disabled={!ready || pending}>
              {pending ? 'reconciling…' : 'run reconciliation'}
            </Button>
            <span className="text-xs text-subtle font-mono">// processed in memory; only counts are saved</span>
          </div>
        </>
      ) : null}

      {error ? <p className="text-crit-fg text-xs">{error}</p> : null}

      {state.ok ? (
        <ReconciliationResults result={state.result} malformedRows={state.malformedRows} saved={state.saved} />
      ) : null}
    </div>
  );
}
