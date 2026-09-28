import { requireAdmin } from '@/lib/admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { AdminNav } from '@/components/admin/admin-nav';
import { StatusCounts } from '@/components/admin/status-counts';
import { SubmissionList } from '@/components/admin/submission-list';
import { ReconciliationOverview } from '@/components/admin/reconciliation/overview';
import {
  SUBMISSION_STATUSES,
  type ReconciliationRun,
  type Submission,
  type SubmissionStatus,
} from '@/types/db';

export const metadata = { title: 'Admin — Revenue-Bug Audit' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAdmin();

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin] load failed', error);
  }

  const submissions: Submission[] = (data ?? []) as Submission[];

  const { data: runData, error: runError } = await supabase
    .from('reconciliation_runs')
    .select('*')
    .order('run_at', { ascending: false });
  if (runError) console.error('[admin] reconciliation runs load failed', runError.code);
  const runs: ReconciliationRun[] = (runData ?? []) as ReconciliationRun[];
  // Ordered newest first, so the first run seen per submission is the latest.
  const latestRuns: Record<string, ReconciliationRun> = {};
  for (const r of runs) latestRuns[r.submission_id] ??= r;

  const counts = SUBMISSION_STATUSES.reduce<Record<SubmissionStatus, number>>(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<SubmissionStatus, number>,
  );
  for (const s of submissions) counts[s.status] = (counts[s.status] ?? 0) + 1;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <section>
          <h1 className="text-xl font-mono font-bold text-text mb-4">
            :: submissions ({submissions.length})
          </h1>
          <StatusCounts counts={counts} />
        </section>

        <section>
          <ReconciliationOverview
            totalRuns={runs.length}
            latestPerSubmission={Object.values(latestRuns)}
          />
        </section>

        <section>
          <SubmissionList submissions={submissions} latestRuns={latestRuns} />
        </section>
      </main>
    </>
  );
}
