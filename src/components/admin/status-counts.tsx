import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { SUBMISSION_STATUSES, type SubmissionStatus } from '@/types/db';

export function StatusCounts({
  counts,
}: {
  counts: Record<SubmissionStatus, number>;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {SUBMISSION_STATUSES.map((s) => (
        <Card key={s} title={s.toLowerCase()}>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-mono font-bold text-text">
              {counts[s] ?? 0}
            </span>
            <StatusBadge status={s} />
          </div>
        </Card>
      ))}
    </div>
  );
}
