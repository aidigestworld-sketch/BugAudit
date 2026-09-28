import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      colors: {
        // Dark terminal surfaces
        bg: '#0b0d10',
        surface: '#12161f',
        raised: '#181e29',
        border: '#263042',
        subtle: '#8a94a6',
        text: '#e5e7eb',
        accent: '#22d3ee', // cyan for :: prefixes and links

        // Severity — used by [CRIT] [RISK] [PASS] badges
        crit: {
          bg: '#3f1212',
          fg: '#ef4444',
          border: '#991b1b',
        },
        risk: {
          bg: '#38230a',
          fg: '#f59e0b',
          border: '#92400e',
        },
        pass: {
          bg: '#0d3320',
          fg: '#10b981',
          border: '#065f46',
        },

        // Status badges — distinct per submission status
        status: {
          new: { bg: '#0c2a38', fg: '#06b6d4', border: '#0e7490' },
          scanning: { bg: '#2e1065', fg: '#a855f7', border: '#6b21a8' },
          report: { bg: '#1e1b4b', fg: '#818cf8', border: '#3730a3' },
          sold: { bg: '#064e3b', fg: '#34d399', border: '#047857' },
          closed: { bg: '#1f2937', fg: '#9ca3af', border: '#374151' },
        },
      },
      borderRadius: {
        badge: '4px',
      },
    },
  },
  plugins: [],
};

export default config;
