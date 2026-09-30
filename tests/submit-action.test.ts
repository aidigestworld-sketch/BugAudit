import { beforeEach, describe, expect, it, vi } from 'vitest';

type InsertCall = { table: string; row: Record<string, unknown> };

const h = vi.hoisted(() => ({
  inserts: [] as InsertCall[],
  /** Methods chained onto the insert builder (select, single, ...). */
  chained: [] as string[],
  insertError: null as { code: string; message: string } | null,
  sendEmail: vi.fn(async (_msg: { text: string }) => ({ data: { id: 'email-1' }, error: null })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push({ table, row });
        // Awaitable like the real PostgrestBuilder, but records any chained
        // call so the test can assert none happened.
        const result = { data: null, error: h.insertError };
        const builder = {
          then: (resolve: (v: typeof result) => unknown) => resolve(result),
          select: () => (h.chained.push('select'), builder),
          single: () => (h.chained.push('single'), builder),
          maybeSingle: () => (h.chained.push('maybeSingle'), builder),
        };
        return builder;
      },
    }),
  }),
}));
vi.mock('@/lib/resend', () => ({ resend: () => ({ emails: { send: h.sendEmail } }) }));
vi.mock('@/lib/env', () => ({
  serverEnv: () => ({
    RESEND_FROM_EMAIL: 'from@example.com',
    ADMIN_EMAIL: 'admin@example.com',
    NEXT_PUBLIC_SITE_URL: 'https://example.com',
  }),
}));

import { submitLead, type SubmitState } from '@/actions/submit';

const IDLE: SubmitState = { status: 'idle' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const fields = {
    repo_link: 'https://github.com/acme/app',
    tech_stack: 'Next.js',
    email: 'lead@example.com',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  h.inserts.length = 0;
  h.chained.length = 0;
  h.insertError = null;
  h.sendEmail.mockClear();
});

describe('submitLead', () => {
  it('inserts without chaining .select() (anon has INSERT but no SELECT under RLS)', async () => {
    const res = await submitLead(IDLE, form());

    expect(res).toEqual({ status: 'ok' });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]!.table).toBe('submissions');
    expect(h.chained).toEqual([]);
  });

  it('generates the id in the action and uses it in the notification email', async () => {
    await submitLead(IDLE, form());

    const id = h.inserts[0]!.row.id;
    expect(id).toMatch(UUID_RE);
    expect(h.sendEmail).toHaveBeenCalledOnce();
    expect(h.sendEmail.mock.calls[0]![0].text).toContain(`Submission id: ${String(id)}`);
  });

  it('stores the email trimmed and lowercased (webhook matches with exact .eq)', async () => {
    await submitLead(IDLE, form({ email: '  Lead.Name@Example.COM ' }));

    expect(h.inserts[0]!.row.email).toBe('lead.name@example.com');
  });

  it('returns a neutral error without leaking the DB message', async () => {
    h.insertError = { code: '42501', message: 'new row violates row-level security policy' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await submitLead(IDLE, form());

    expect(res.status).toBe('error');
    expect(JSON.stringify(res)).not.toContain('row-level security');
    expect(h.sendEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
