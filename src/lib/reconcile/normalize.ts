import type { ReconcilePolicy } from './types';

/** Join key: trimmed, lowercased. Empty string means "no identifier". */
export function normalizeId(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

const TRUE_WORDS = new Set(['true', 't', '1', 'yes', 'y', 'active', 'enabled', 'on', 'granted']);
const FALSE_WORDS = new Set([
  'false', 'f', '0', 'no', 'n', 'inactive', 'disabled', 'off', 'revoked', 'null',
]);

/**
 * Tolerant access-flag parser. Boolean-ish words win first; otherwise the
 * value is treated as a plan name — any non-empty plan not in
 * policy.noAccessValues counts as access.
 */
export function parseAccessFlag(raw: string | undefined, policy: ReconcilePolicy): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  if (policy.noAccessValues.includes(v)) return false;
  return v.length > 0;
}

/**
 * Parses a money cell in major units ("$1,234.50", "49", "49,00 €") into
 * integer cents. Returns null for empty or unparseable input.
 */
export function parseAmountCents(raw: string | undefined): number | null {
  let s = (raw ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever separator comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // "49,00" → decimal; "1,234" → thousands.
    s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const UNIT_MONTHS: Record<string, number> = {
  day: 12 / 365, daily: 12 / 365,
  week: 12 / 52, weekly: 12 / 52,
  month: 1, monthly: 1, mo: 1,
  quarter: 3, quarterly: 3,
  year: 12, yearly: 12, annual: 12, annually: 12, yr: 12,
};

/**
 * Billing interval → length in months ("year" → 12, "3 months" → 3,
 * "every 2 weeks" → ~0.46). Null for empty or unrecognized input.
 */
export function parseIntervalMonths(raw: string | undefined): number | null {
  const v = (raw ?? '').trim().toLowerCase();
  const m = /^(?:every\s+)?(\d+)?\s*([a-z]+?)s?$/.exec(v);
  if (!m?.[2]) return null;
  const unit = UNIT_MONTHS[m[2]];
  if (unit === undefined) return null;
  const count = m[1] ? Number(m[1]) : 1;
  return count > 0 ? unit * count : null;
}
