import type { ReactNode } from 'react';

type CardProps = {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Terminal-style card. Header uses the ":: title" convention on a darker
 * sub-surface, cyan monospace text. See CLAUDE.md > Design system.
 */
export function Card({ title, right, children, className }: CardProps) {
  return (
    <section
      className={`rounded-md border border-border bg-surface overflow-hidden ${className ?? ''}`}
    >
      <header className="flex items-center justify-between px-4 py-2 bg-bg/60 border-b border-border">
        <span className="font-mono text-accent text-xs tracking-wide">
          :: {title}
        </span>
        {right ? <div className="text-xs text-subtle">{right}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
