import { SeverityBadge, type SeverityVariant } from '@/components/ui/badge';
import { CATEGORY_LABELS } from '@/lib/reconcile/report';
import type { Category } from '@/lib/reconcile/types';

export const CATEGORY_VARIANT: Record<Category, SeverityVariant> = {
  paid_no_access: 'crit',
  access_no_payment: 'crit',
  past_due_with_access: 'risk',
  stripe_only_paying: 'crit',
  stripe_only_inactive: 'pass',
  access_only_review: 'risk',
  access_only_ignored: 'pass',
  missing_identifiers: 'risk',
  matched_ok: 'pass',
};

export function CategoryBadge({ category }: { category: Category }) {
  return <SeverityBadge variant={CATEGORY_VARIANT[category]} label={CATEGORY_LABELS[category]} />;
}
