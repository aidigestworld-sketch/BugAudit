'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitLead, type SubmitState } from '@/actions/submit';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const initialState: SubmitState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'submitting…' : 'request free scan'}
    </Button>
  );
}

export function IntakeForm() {
  const [state, formAction] = useActionState(submitLead, initialState);

  if (state.status === 'ok') {
    return (
      <Card title="submission received">
        <p className="text-pass-fg text-sm">
          Submission received — I&apos;ll review your codebase and reply within
          48 hours.
        </p>
        <p className="text-subtle text-xs mt-2">
          Check the inbox you provided. Nothing to do on your end.
        </p>
      </Card>
    );
  }

  const fieldErr = (name: string) =>
    state.status === 'error' ? state.fieldErrors?.[name] : undefined;

  return (
    <Card title="intake / free scan">
      <form action={formAction} className="space-y-4" noValidate>
        <Field
          label="repo or service link"
          name="repo_link"
          placeholder="https://github.com/you/your-saas"
          required
          error={fieldErr('repo_link')}
        />
        <Field
          label="tech stack (optional)"
          name="tech_stack"
          placeholder="Next.js + Postgres + Stripe"
          error={fieldErr('tech_stack')}
        />
        <Field
          label="your email"
          name="email"
          type="email"
          placeholder="you@yourdomain.com"
          required
          error={fieldErr('email')}
        />

        {state.status === 'error' && !state.fieldErrors ? (
          <p className="text-crit-fg text-xs">{state.message}</p>
        ) : null}

        <SubmitButton />
      </form>
    </Card>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-subtle mb-1">
        {label}
        {required ? <span className="text-crit-fg"> *</span> : null}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className={`w-full rounded-md border bg-bg text-text placeholder:text-subtle/60 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 ${error ? 'border-crit-border' : 'border-border'}`}
      />
      {error ? <span className="block text-crit-fg text-xs mt-1">{error}</span> : null}
    </label>
  );
}
