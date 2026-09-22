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
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Applies to jev-1.13</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Where Jev breaks</h1>
      <p className="mt-3 max-w-[60ch] text-[17px] leading-relaxed text-muted-foreground">
        Four of TypeSafe&rsquo;s documented failure modes and one common Score mistake, each runnable beside the fix. A failure is a tendency, so any
        single run can land either way.
      </p>
      <p className="mt-2 text-sm text-faint">
        Source:{' '}
        <a className="text-brand hover:underline" href={SITE.links.jaggedness} target="_blank" rel="noreferrer">
          TypeSafe&rsquo;s jaggedness page ↗
        </a>{' '}
        · reviewed 2026-09-17
      </p>

      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 text-sm">
        {LIMITS.map((l) => (
          <a key={l.anchor} href={`#${l.anchor}`} className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground hover:text-foreground">
            {l.heading}
          </a>
        ))}
        <a href="#the-rest" className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground hover:text-foreground">
          The other five
        </a>
      </nav>

      <AllLimits />

      <section id="the-rest" className="mt-14 scroll-mt-24 border-t border-border pt-8">
        <h2 className="text-2xl font-semibold">The other five, quoted</h2>
        <p className="mt-2 max-w-[66ch] text-sm text-muted-foreground">
          Not runnable here yet. Each is paraphrased from the jaggedness page with the advice it gives.
        </p>
        <div className="mt-5 grid max-md:grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {QUOTED_MODES.map((m) => (
            <article key={m.anchor} id={m.anchor} className="flex scroll-mt-24 flex-col rounded-[16px] border border-border bg-card p-5 shadow-card">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted font-mono text-[11px]">{m.mode}</span>
                <h3 className="text-[14.5px] font-semibold">{m.heading}</h3>
              </div>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">{m.docs}</p>
              <p className="mt-3 rounded-[10px] bg-muted/60 px-3 py-2 text-[12.5px] leading-snug">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">Instead · </span>
                {m.instead}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm">
          <Link className="text-brand hover:underline" href="/learn/exact-checks">
            Lesson 6 walks through the counting rewrite step by step →
          </Link>
        </p>
      </section>
    </PageShell>
  )
}
