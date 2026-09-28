'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import {
  updateNote,
  updateStatus,
} from '@/actions/admin-submissions';
import {
  SUBMISSION_STATUSES,
  type ReconciliationRun,
  type Submission,
  type SubmissionStatus,
} from '@/types/db';
import { ReconciliationPanel } from './reconciliation/panel';
import { LatestRunSummary } from './reconciliation/latest-run';

export function SubmissionCard({
  submission,
  latestRun,
}: {
  submission: Submission;
  latestRun: ReconciliationRun | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>(submission.status);
  const [note, setNote] = useState<string>(submission.internal_note ?? '');
  const [savedNote, setSavedNote] = useState<string>(submission.internal_note ?? '');
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onChangeStatus = (next: SubmissionStatus) => {
    const prev = status;
    setStatus(next);
    setError(null);
    startSaving(async () => {
      const res = await updateStatus({ id: submission.id, status: next });
      if (!res.ok) {
        setStatus(prev);
        setError(res.error);
      }
    });
  };

  const saveNote = () => {
    if (note === savedNote) return;
    setError(null);
    startSaving(async () => {
      const res = await updateNote({ id: submission.id, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedNote(note);
    });
  };

  const submittedAt = new Date(submission.created_at).toLocaleString();

  return (
    <Card
      title={`submission ${submission.id.slice(0, 8)}`}
      right={
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-subtle hover:text-text font-mono"
          >
            {expanded ? '[ collapse ]' : '[ expand ]'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <Field label="repo">
          <a
            href={submission.repo_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent break-all"
          >
            {submission.repo_link}
          </a>
        </Field>
        <Field label="email">
          <span className="text-text break-all">{submission.email}</span>
        </Field>
        <Field label="submitted">
          <span className="text-subtle">{submittedAt}</span>
        </Field>
      </div>

      {latestRun ? (
        <div className="mt-3">
          <LatestRunSummary run={latestRun} />
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <Field label="tech stack">
            <span className="text-text">
              {submission.tech_stack ?? <em className="text-subtle">not provided</em>}
            </span>
          </Field>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs text-subtle mb-1">status</span>
              <select
                value={status}
                onChange={(e) => onChangeStatus(e.target.value as SubmissionStatus)}
                disabled={saving}
                className="w-full rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {SUBMISSION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <Field label="stripe session">
              <span className="text-subtle text-xs break-all">
                {submission.stripe_session_id ?? '—'}
              </span>
            </Field>
          </div>

          <label className="block">
            <span className="block text-xs text-subtle mb-1">
              internal note {note !== savedNote ? '· unsaved' : ''}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              rows={4}
              className="w-full rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="private notes — never shown to the submitter"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={saveNote}
                disabled={saving || note === savedNote}
                className="text-xs text-subtle hover:text-text font-mono disabled:opacity-40"
              >
                {saving ? 'saving…' : '[ save note ]'}
              </button>
            </div>
          </label>

          {error ? (
            <p className="text-crit-fg text-xs">{error}</p>
          ) : null}

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setReconOpen((v) => !v)}
              className="text-xs text-accent hover:text-text font-mono"
            >
              {reconOpen ? '[ hide reconciliation ]' : '[ reconciliation ]'}
            </button>
            {reconOpen ? (
              <div className="mt-4">
                <ReconciliationPanel submissionId={submission.id} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-subtle">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
