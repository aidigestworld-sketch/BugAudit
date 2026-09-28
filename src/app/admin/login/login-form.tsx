'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type LoginState } from '@/actions/admin-auth';
import { Button } from '@/components/ui/button';

const initial: LoginState = { status: 'idle' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'signing in…' : 'sign in'}
    </Button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(signIn, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <label className="block">
        <span className="block text-xs text-subtle mb-1">email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-subtle mb-1">password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-border bg-bg text-text px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </label>
      {state.status === 'error' ? (
        <p className="text-crit-fg text-xs">{state.message}</p>
      ) : null}
      <Submit />
    </form>
  );
}
