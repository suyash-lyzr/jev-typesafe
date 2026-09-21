import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { AllLimits } from '@/components/limits/limits-lab'
import { LIMITS, QUOTED_MODES } from '@/content/limits'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Where Jev breaks',
  description:
    'Four of jev-1.13’s documented failure modes and one common Score mistake, each runnable live on this page beside the rewrite that works.',
}

export default function LimitsPage() {
  return (
    <PageShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Applies to jev-1.13</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Where Jev breaks</h1>
      <p className="mt-3 max-w-[66ch] text-base leading-relaxed text-muted-foreground">
        TypeSafe publishes nine known failure modes for jev-1.13. Four of them run live below, plus one
        common Score mistake. Each has a check that reads the live answer and says whether the
        failure showed up this time, and all but the invariants section sit next to the rewrite that
        works; for the invariants the fix is structural, and the advice says what it is. The rest are
        quoted at the end.
      </p>
      <p className="mt-2 max-w-[66ch] text-sm text-muted-foreground">
        Nothing runs until you press a button. A failure mode is a tendency, not a certainty, so any
        single run can land either way; the rewrite is what holds.{' '}
        <a className="text-brand hover:underline" href={SITE.links.jaggedness} target="_blank" rel="noreferrer">
          TypeSafe&rsquo;s jaggedness page, last reviewed 2026-09-17 ↗
        </a>
      </p>

      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 text-sm">
        {LIMITS.map((l) => (
          <a key={l.anchor} href={`#${l.anchor}`} className="rounded-md border border-border px-2.5 py-1 hover:bg-accent">
            {l.heading}
          </a>
        ))}
        <a href="#the-rest" className="rounded-md border border-border px-2.5 py-1 hover:bg-accent">
          The other five
        </a>
      </nav>

      <AllLimits />

      <section id="the-rest" className="mt-14 scroll-mt-24 border-t border-border pt-8">
        <h2 className="text-2xl font-semibold">The other five, quoted</h2>
        <p className="mt-2 max-w-[66ch] text-sm text-muted-foreground">
          Not runnable here yet. Each is paraphrased from the jaggedness page with the advice it gives.
        </p>
        <dl className="mt-5 space-y-5">
          {QUOTED_MODES.map((m) => (
            <div key={m.anchor} id={m.anchor} className="scroll-mt-24">
              <dt className="text-[15px] font-semibold">
                {m.mode}. {m.heading}
              </dt>
              <dd className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                {m.docs} <span className="text-foreground">Instead:</span> {m.instead}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm">
          <Link className="text-brand hover:underline" href="/learn/exact-checks">
            Lesson 6 walks through the counting rewrite step by step →
          </Link>
        </p>
      </section>
    </PageShell>
  )
}
