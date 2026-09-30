import { Suspense } from 'react';
import { TerminalPreview } from '@/components/landing/terminal-preview';
import { IntakeForm } from '@/components/landing/intake-form';
import { FixItCta } from '@/components/landing/fix-it-cta';
import { CheckoutNotice } from '@/components/landing/checkout-notice';
import { Card } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 md:py-20">
      <Header />

      <div className="mt-8 empty:hidden">
        <Suspense fallback={null}>
          <CheckoutNotice />
        </Suspense>
      </div>

      <section className="mt-10 space-y-4">
        <h1 className="text-3xl md:text-5xl font-mono font-bold tracking-tight text-text">
          Free scan of your SaaS codebase for bugs that
          <br className="hidden md:block" />{' '}
          <span className="text-accent">quietly cost you money.</span>
        </h1>
        <p className="text-subtle text-sm md:text-base max-w-2xl">
          You send a repo link. Within 48 hours you get a written report with
          the revenue-affecting bugs, security holes, and silent regressions
          I&apos;d fix first. No obligation. If you want them fixed too, buy
          the $199 fix-it engagement below.
        </p>
      </section>

      <section className="mt-10">
        <TerminalPreview />
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-5">
        <div className="md:col-span-3">
          <IntakeForm />
        </div>
        <div className="md:col-span-2">
          <Card title="scope">
            <p className="text-sm text-text">
              I scan for: payment / billing bugs, auth &amp; session issues,
              webhook handling, background-job silent failures, N+1s that spike
              your DB bill, and obvious data leaks.
            </p>
            <p className="text-sm text-subtle mt-3">
              I don&apos;t do: performance tuning at scale, iOS/Android native
              code, or full security audits. If you need those I&apos;ll say so
              and refer you out.
            </p>
          </Card>
        </div>
      </section>

      <section id="fix-it" className="mt-6 scroll-mt-6">
        <FixItCta />
      </section>

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-accent">
        <span className="inline-block w-2 h-2 rounded-full bg-pass-fg animate-pulse" />
        <span className="font-bold">revenue-bug-audit</span>
        <span className="text-subtle text-xs">// v0.1</span>
      </div>
      <div className="text-subtle text-xs">
        one-person operation · reply in 48h
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-border pt-6 text-xs text-subtle flex flex-col md:flex-row md:justify-between gap-2">
      <span>© {new Date().getFullYear()} revenue-bug-audit</span>
      <span>built for founders shipping too fast to notice the leaks</span>
    </footer>
  );
}
