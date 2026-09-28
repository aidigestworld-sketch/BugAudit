'use client';

import { useMemo, useState } from 'react';
import type { ReconciliationRun, Submission } from '@/types/db';
import { SubmissionCard } from './submission-card';

type Sort = 'newest' | 'oldest';

export function SubmissionList({
  submissions,
  latestRuns,
}: {
  submissions: Submission[];
  latestRuns: Record<string, ReconciliationRun>;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? submissions.filter(
          (s) =>
            s.email.toLowerCase().includes(q) ||
            s.repo_link.toLowerCase().includes(q) ||
            (s.tech_stack ?? '').toLowerCase().includes(q) ||
            (s.internal_note ?? '').toLowerCase().includes(q) ||
            s.status.toLowerCase().includes(q),
        )
      : submissions;

    const sorted = [...base].sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sort === 'newest' ? db - da : da - db;
    });
    return sorted;
  }, [submissions, query, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search by email, repo, stack, note, status…"
          className="w-full md:max-w-md rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <div className="flex items-center gap-2 text-xs text-subtle font-mono">
          <span>sort:</span>
          <button
            type="button"
            onClick={() => setSort('newest')}
            className={sort === 'newest' ? 'text-accent' : 'hover:text-text'}
          >
            newest
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => setSort('oldest')}
            className={sort === 'oldest' ? 'text-accent' : 'hover:text-text'}
          >
            oldest
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-subtle text-sm font-mono px-1">
          {submissions.length === 0
            ? '// no submissions yet'
            : '// no matches for that search'}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => (
            <li key={s.id}>
              <SubmissionCard submission={s} latestRun={latestRuns[s.id] ?? null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
