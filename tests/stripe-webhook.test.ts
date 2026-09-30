import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = [method: string, ...args: unknown[]];
type Query = { table: string; ops: Op[] };

const h = vi.hoisted(() => ({
  queries: [] as Query[],
  rows: [] as { id: string }[],
  findError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  sendEmail: vi.fn(
    async (_msg: { subject: string; text: string }): Promise<{ data: unknown; error: unknown }> => ({
      data: { id: 'email-1' },
      error: null,
    }),
  ),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: () => ({
    webhooks: {
      // The test body *is* the event; signature 'bad' simulates a forged request.
      constructEvent: (body: string, sig: string) => {
        if (sig === 'bad') throw new Error('No signatures found');
        return JSON.parse(body) as unknown;
      },
    },
  }),
}));
vi.mock('@/lib/env', () => ({
  serverEnv: () => ({
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    RESEND_FROM_EMAIL: 'from@example.com',
    ADMIN_EMAIL: 'admin@example.com',
    NEXT_PUBLIC_SITE_URL: 'https://example.com',
  }),
}));
vi.mock('@/lib/resend', () => ({ resend: () => ({ emails: { send: h.sendEmail } }) }));
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      const query: Query = { table, ops: [] };
      h.queries.push(query);
      const builder = {
        then: (resolve: (v: unknown) => unknown) =>
          resolve(
            query.ops.some(([m]) => m === 'update')
              ? { data: null, error: h.updateError }
              : { data: h.rows, error: h.findError },
          ),
      };
      for (const m of ['select', 'eq', 'ilike', 'order', 'limit', 'update']) {
        Object.assign(builder, {
          [m]: (...args: unknown[]) => (query.ops.push([m, ...args]), builder),
        });
      }
      return builder;
    },
  }),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

const SUBMISSION_ID = '5f0c1f7e-7d7b-4a8e-9a55-0d0b3b8f2c11';

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: 19900,
    currency: 'usd',
    customer_email: null,
    customer_details: { email: 'Lead@Example.com' },
    ...overrides,
  };
}

async function deliver(type: string, obj: Record<string, unknown> = session(), sig = 'sig') {
  const res = await POST(
    new Request('https://example.com/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body: JSON.stringify({ id: 'evt_1', type, data: { object: obj } }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const updates = () => h.queries.filter((q) => q.ops.some(([m]) => m === 'update'));

beforeEach(() => {
  h.queries.length = 0;
  h.rows = [{ id: SUBMISSION_ID }];
  h.findError = null;
  h.updateError = null;
  h.sendEmail.mockReset();
  h.sendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('stripe webhook — payment status', () => {
  it('rejects a bad signature without touching the DB', async () => {
    const res = await deliver('checkout.session.completed', session(), 'bad');
    expect(res.status).toBe(400);
    expect(h.queries).toHaveLength(0);
  });

  it('marks Fix-It Sold on checkout.session.completed when paid', async () => {
    const res = await deliver('checkout.session.completed');

    expect(res).toEqual({
      status: 200,
      body: { received: true, matched: true, id: SUBMISSION_ID },
    });
    expect(updates()).toHaveLength(1);
    expect(updates()[0]!.ops).toContainEqual([
      'update',
      { status: 'Fix-It Sold', stripe_session_id: 'cs_test_123' },
    ]);
    expect(updates()[0]!.ops).toContainEqual(['eq', 'id', SUBMISSION_ID]);
  });

  it.each(['unpaid', 'no_payment_required'])(
    'does NOT mark sold on completed with payment_status=%s',
    async (payment_status) => {
      const res = await deliver('checkout.session.completed', session({ payment_status }));

      expect(res).toEqual({ status: 200, body: { received: true, paid: false } });
      expect(h.queries).toHaveLength(0);
    },
  );

  it('marks Fix-It Sold on checkout.session.async_payment_succeeded', async () => {
    const res = await deliver('checkout.session.async_payment_succeeded');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matched: true, id: SUBMISSION_ID });
    expect(updates()).toHaveLength(1);
  });

  it('on async_payment_failed leaves status alone and emails the admin', async () => {
    const res = await deliver(
      'checkout.session.async_payment_failed',
      session({ payment_status: 'unpaid' }),
    );

    expect(res).toEqual({ status: 200, body: { received: true, paid: false } });
    expect(h.queries).toHaveLength(0);
    expect(h.sendEmail).toHaveBeenCalledOnce();
    const msg = h.sendEmail.mock.calls[0]![0] as { subject: string; text: string };
    expect(msg.subject).toContain('FAILED');
    expect(msg.text).toContain('cs_test_123');
    expect(msg.text).toContain('lead@example.com');
  });

  it('async_payment_failed still returns 200 when Resend throws', async () => {
    h.sendEmail.mockRejectedValue(new Error('resend down'));
    const res = await deliver('checkout.session.async_payment_failed');
    expect(res.status).toBe(200);
  });

  it('ignores unrelated event types', async () => {
    const res = await deliver('invoice.paid');
    expect(res).toEqual({ status: 200, body: { received: true, ignored: 'invoice.paid' } });
    expect(h.queries).toHaveLength(0);
  });
});
