import { signOut } from '@/actions/admin-auth';

export function AdminNav() {
  return (
    <nav className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-accent text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-pass-fg" />
          <span className="font-bold">revenue-bug-audit</span>
          <span className="text-subtle text-xs">// admin</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-subtle hover:text-text font-mono"
          >
            sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
