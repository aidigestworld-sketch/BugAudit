import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // Reconciliation uploads two gzipped CSVs (see src/lib/reconcile/limits.ts).
    // Stays under Vercel's 4.5 MB request-body cap.
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default config;
