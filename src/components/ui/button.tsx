import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-accent text-bg hover:bg-cyan-300 focus-visible:ring-cyan-400 border-transparent',
  secondary:
    'bg-raised text-text hover:bg-border border-border',
  ghost:
    'bg-transparent text-subtle hover:text-text hover:bg-raised border-transparent',
};

export function Button({
  variant = 'primary',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-mono font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className ?? ''}`}
    />
  );
}
