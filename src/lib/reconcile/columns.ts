import type { ColumnMapping, CsvRow } from './types';

type Role = keyof ColumnMapping;

/** Header phrases per role, best first. Compared after normalization. */
const HINTS: Record<Role, readonly string[]> = {
  stripeCustomerId: ['customer id', 'customer', 'stripe customer id', 'cus id'],
  stripeStatus: ['status', 'subscription status', 'state'],
  stripeAmount: ['monthly amount', 'mrr', 'amount', 'plan amount', 'price', 'unit amount', 'total'],
  stripeInterval: ['interval', 'billing interval', 'plan interval', 'billing period', 'recurring interval', 'frequency'],
  accessCustomerId: ['stripe customer id', 'customer id', 'stripe id', 'customer', 'billing id'],
  accessFlag: ['has access', 'access', 'plan', 'tier', 'is active', 'active', 'subscription', 'entitled', 'enabled', 'status'],
};

const STRIPE_STATUSES = new Set([
  'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused',
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter(Boolean));
}

/** 0–100 header similarity against the role's hint phrases. */
function headerScore(header: string, role: Role): number {
  const h = norm(header);
  const ht = tokens(header);
  let best = 0;
  HINTS[role].forEach((hint, i) => {
    const rankBonus = 10 - Math.min(i, 9); // earlier hints are stronger
    if (h === hint) best = Math.max(best, 80 + rankBonus);
    else if (h.includes(hint)) best = Math.max(best, 55 + rankBonus);
    else {
      const htk = tokens(hint);
      const overlap = [...htk].filter((t) => ht.has(t)).length;
      if (overlap) best = Math.max(best, (40 * overlap) / Math.max(htk.size, ht.size) + rankBonus / 2);
    }
  });
  return best;
}

/** Bonus from what the column's sample values look like. */
function valueScore(values: string[], role: Role): number {
  const v = values.map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (v.length === 0) return 0;
  const share = (pred: (x: string) => boolean) => v.filter(pred).length / v.length;
  switch (role) {
    case 'stripeCustomerId':
    case 'accessCustomerId':
      return 40 * share((x) => x.startsWith('cus_')) - 40 * share((x) => /^(sub|si|in|pi)_/.test(x) || x.includes('@'));
    case 'stripeStatus':
      return 30 * share((x) => STRIPE_STATUSES.has(x));
    case 'stripeAmount':
      return 20 * share((x) => /^[$€£]?\s?-?[\d.,]+\s?[$€£]?$/.test(x)) - 30 * share((x) => x.includes('@'));
    case 'stripeInterval':
      return 30 * share((x) => /^(\d+\s*)?(day|week|month|quarter|year|annual)/.test(x));
    case 'accessFlag':
      return -40 * share((x) => x.startsWith('cus_') || x.includes('@'));
  }
}

function pick(headers: string[], sample: CsvRow[], role: Role, taken: Set<string>): string | null {
  let best: { header: string; score: number } | null = null;
  for (const header of headers) {
    if (taken.has(header)) continue;
    const score = headerScore(header, role) + valueScore(sample.map((r) => r[header] ?? ''), role);
    if (!best || score > best.score) best = { header, score };
  }
  if (!best || best.score < 30) return null;
  taken.add(best.header);
  return best.header;
}

export type SuggestedMapping = { [K in keyof ColumnMapping]: string | null };

/**
 * Guesses column roles from headers + a few sample rows. Nothing is
 * hardcoded to Stripe's exact export names; the admin can override every pick.
 */
export function suggestMapping(
  stripe: { headers: string[]; sample: CsvRow[] },
  access: { headers: string[]; sample: CsvRow[] },
): SuggestedMapping {
  const takenS = new Set<string>();
  const takenA = new Set<string>();
  // Ids first — they have the strongest value signal.
  const stripeCustomerId = pick(stripe.headers, stripe.sample, 'stripeCustomerId', takenS);
  const stripeStatus = pick(stripe.headers, stripe.sample, 'stripeStatus', takenS);
  const stripeAmount = pick(stripe.headers, stripe.sample, 'stripeAmount', takenS);
  const stripeInterval = pick(stripe.headers, stripe.sample, 'stripeInterval', takenS);
  const accessCustomerId = pick(access.headers, access.sample, 'accessCustomerId', takenA);
  const accessFlag = pick(access.headers, access.sample, 'accessFlag', takenA);
  return { stripeCustomerId, stripeStatus, stripeAmount, stripeInterval, accessCustomerId, accessFlag };
}
