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

describe('stripe webhook — admin email on every paid checkout', () => {
  const lastEmail = () => h.sendEmail.mock.calls.at(-1)![0] as { subject: string; text: string };

  it('includes session id, amount, currency, customer email and the matched id', async () => {
    await deliver('checkout.session.completed');

    expect(h.sendEmail).toHaveBeenCalledOnce();
    const { text } = lastEmail();
    expect(text).toContain('cs_test_123');
    expect(text).toContain('19900');
    expect(text).toContain('USD');
    expect(text).toContain('lead@example.com');
    expect(text).toContain(`Match:    ${SUBMISSION_ID}`);
  });

  it('emails on async_payment_succeeded too', async () => {
    await deliver('checkout.session.async_payment_succeeded');
    expect(h.sendEmail).toHaveBeenCalledOnce();
  });

  it('emails NO MATCH when no submission has the email', async () => {
    h.rows = [];
    const res = await deliver('checkout.session.completed');

    expect(res).toEqual({ status: 200, body: { received: true, matched: false } });
    expect(lastEmail().text).toContain('Match:    NO MATCH');
  });

  it('emails NO MATCH when the session carries no email at all', async () => {
    const res = await deliver(
      'checkout.session.completed',
      session({ customer_email: null, customer_details: null }),
    );

    expect(res.status).toBe(200);
    expect(h.queries).toHaveLength(0);
    expect(lastEmail().text).toContain('NO MATCH');
  });

  it('still emails when the lookup fails, and keeps the 500 so Stripe retries', async () => {
    h.findError = { message: 'connection reset' };
    const res = await deliver('checkout.session.completed');

    expect(res.status).toBe(500);
    expect(lastEmail().text).toContain('NO MATCH');
    expect(lastEmail().text).not.toContain('connection reset');
  });

  it('still emails when the update fails, and keeps the 500', async () => {
    h.updateError = { message: 'boom' };
    const res = await deliver('checkout.session.completed');

    expect(res.status).toBe(500);
    expect(lastEmail().text).toContain(SUBMISSION_ID);
  });

  it('does not email for an unpaid completed session', async () => {
    await deliver('checkout.session.completed', session({ payment_status: 'unpaid' }));
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['throws', () => h.sendEmail.mockRejectedValue(new Error('resend down'))],
    ['returns an error', () => h.sendEmail.mockResolvedValue({ data: null, error: { message: 'rate limited' } })],
  ])('response code is unchanged when Resend %s', async (_label, breakResend) => {
    breakResend();
    const ok = await deliver('checkout.session.completed');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ matched: true });

    h.findError = { message: 'db down' };
    const retry = await deliver('checkout.session.completed');
    expect(retry.status).toBe(500);
  });
});

describe('stripe webhook — email matching', () => {
  const lookup = () => h.queries.find((q) => q.ops.some(([m]) => m === 'select'))!;

  it('matches with an exact .eq on the lowercased, trimmed email — never .ilike', async () => {
    await deliver(
      'checkout.session.completed',
      session({ customer_email: '  A_B%@Example.COM ', customer_details: null }),
    );

    expect(lookup().ops).toContainEqual(['eq', 'email', 'a_b%@example.com']);
    expect(lookup().ops.map(([m]) => m)).not.toContain('ilike');
  });

  it('prefers customer_email over customer_details.email', async () => {
    await deliver(
      'checkout.session.completed',
      session({ customer_email: 'first@example.com', customer_details: { email: 'second@example.com' } }),
    );
    expect(lookup().ops).toContainEqual(['eq', 'email', 'first@example.com']);
  });

  it('picks the most recent submission', async () => {
    await deliver('checkout.session.completed');
    expect(lookup().ops).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(lookup().ops).toContainEqual(['limit', 1]);
  });
});
