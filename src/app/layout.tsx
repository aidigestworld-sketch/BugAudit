import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Revenue-Bug Audit — Free scan of your SaaS codebase',
  description:
    'Free scan of your SaaS codebase for bugs that quietly cost you money. Submit a repo, get findings in 48 hours.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
