import { describe, expect, it } from 'vitest';
import { normalizeId, parseAccessFlag, parseAmountCents, parseIntervalMonths } from './normalize';
import { DEFAULT_POLICY } from './policy';
import { parseCsv } from './csv';
import { suggestMapping } from './columns';

describe('parseAccessFlag', () => {
  const yes = ['true', 'TRUE', '1', 'yes', 'Y', 'active', 'Enabled', 'pro', 'Team Plan', ' growth '];
  const no = ['false', '0', 'no', 'N', 'inactive', 'disabled', 'free', 'FREE', 'none', '', '  ', 'null'];
  it.each(yes)('%j → access', (v) => expect(parseAccessFlag(v, DEFAULT_POLICY)).toBe(true));
  it.each(no)('%j → no access', (v) => expect(parseAccessFlag(v, DEFAULT_POLICY)).toBe(false));

  it('uses configurable no-access plan names', () => {
    const policy = { ...DEFAULT_POLICY, noAccessValues: [...DEFAULT_POLICY.noAccessValues, 'starter'] };
    expect(parseAccessFlag('Starter', policy)).toBe(false);
  });
});

describe('normalizeId', () => {
  it('trims and lowercases', () => expect(normalizeId('  CUS_Ab1\t')).toBe('cus_ab1'));
  it('handles undefined', () => expect(normalizeId(undefined)).toBe(''));
});

describe('parseAmountCents', () => {
  it.each([
    ['49', 4900],
    ['49.00', 4900],
    ['$1,234.50', 123450],
    ['1.234,50 €', 123450],
    ['49,90', 4990],
    ['1,234', 123400],
    ['USD 19.99', 1999],
  ])('%j → %i', (v, cents) => expect(parseAmountCents(v)).toBe(cents));

  it.each(['', 'n/a', '—'])('%j → null', (v) => expect(parseAmountCents(v)).toBeNull());
});

describe('parseIntervalMonths', () => {
  it.each([
    ['month', 1],
    ['Monthly', 1],
    ['year', 12],
    ['Yearly', 12],
    ['annual', 12],
    ['1 year', 12],
    ['3 months', 3],
    ['every 6 months', 6],
    ['quarterly', 3],
  ])('%j → %d', (v, months) => expect(parseIntervalMonths(v)).toBe(months));

  it('handles weeks', () => expect(parseIntervalMonths('week')).toBeCloseTo(12 / 52));
  it.each(['', 'sometimes', '0 months'])('%j → null', (v) => expect(parseIntervalMonths(v)).toBeNull());
});

describe('parseCsv', () => {
  it('trims headers, strips BOM, skips blank lines', () => {
    const out = parseCsv('\uFEFF id , Status \ncus_1,active\n\n\ncus_2,canceled\n');
    expect(out.headers).toEqual(['id', 'Status']);
    expect(out.rows).toEqual([
      { id: 'cus_1', Status: 'active' },
      { id: 'cus_2', Status: 'canceled' },
    ]);
  });

  it('handles an empty file', () => {
    const out = parseCsv('');
    expect(out.headers).toEqual([]);
    expect(out.rows).toEqual([]);
  });

  it('counts malformed rows', () => {
    expect(parseCsv('a,b\n1,2\n3\n').malformedRows).toBe(1);
  });
});

describe('suggestMapping', () => {
  it('picks columns by header similarity and sample values', () => {
    const stripe = parseCsv(
      'id,Customer ID,Customer Email,Status,Plan,Amount,Billing Period\n' +
        'sub_1,cus_1,a@x.com,active,Pro,49.00,month\nsub_2,cus_2,b@x.com,canceled,Pro,490.00,year\n',
    );
    const access = parseCsv('email,billing_customer,tier\na@x.com,cus_1,pro\nb@x.com,cus_2,free\n');
    const m = suggestMapping(
      { headers: stripe.headers, sample: stripe.rows },
      { headers: access.headers, sample: access.rows },
    );
    expect(m).toEqual({
      stripeCustomerId: 'Customer ID',
      stripeStatus: 'Status',
      stripeAmount: 'Amount',
      stripeInterval: 'Billing Period',
      accessCustomerId: 'billing_customer',
      accessFlag: 'tier',
    });
  });

  it('returns null when nothing plausible exists', () => {
    const m = suggestMapping({ headers: ['foo'], sample: [] }, { headers: ['bar'], sample: [] });
    expect(m.stripeStatus).toBeNull();
    expect(m.stripeInterval).toBeNull();
    expect(m.accessFlag).toBeNull();
  });
});
