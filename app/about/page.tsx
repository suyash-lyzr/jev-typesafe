import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { LyzrLogo } from '@/components/layout/lyzr-logo'
import { DataFlow } from '@/components/visuals/visuals'
import { pastel } from '@/components/visuals/pastel'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SITE } from '@/lib/site'
import { PRICING } from '@/lib/pricing'
import { LIMITS } from '@/lib/guards'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Who built Jev Lab, who pays for the runs, where every number comes from, and what this site is not.',
}

export default function AboutPage() {
  return (
    <PageShell>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">About {SITE.name}</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        {SITE.description}
      </p>

      <section className="mt-10" aria-labelledby="path-heading">
        <h2 id="path-heading" className="text-xl font-semibold">Where a run goes</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">No sign-up, no key to paste. Lyzr pays, so every run passes our guard rails first.</p>
        <DataFlow
          className="mt-5"
          nodes={[
            { title: 'Your browser', sub: 'History and progress stay here', icon: 'monitor' },
            { title: 'Lyzr server', sub: 'Rate limits · daily $ cap · never logs your text', icon: 'shield', tone: 'ink' },
            [
            { title: 'TypeSafe', sub: 'Jev answers', icon: 'cpu' },
            { title: 'OpenAI', sub: 'Only when you compare', icon: 'sparkles', tone: 'muted' },
          ],
          ]}
        />
        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { v: LIMITS.play.perMinute, l: 'runs / minute' },
            { v: LIMITS.play.perDay, l: 'runs / day' },
            { v: LIMITS.compare.perMinute, l: 'comparisons / minute' },
            { v: LIMITS.compare.perDay, l: 'comparisons / day' },
          ].map((x, i) => (
            <div key={x.l} className={cn('rounded-[16px] border px-5 py-4 shadow-card', pastel(i))}>
              <dt className="sr-only">{x.l}</dt>
              <dd>
                <span className="num block text-[24px] font-semibold leading-none">{x.v}</span>
                <span className="mt-1.5 block text-[12.5px] text-muted-foreground">{x.l}, per network</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          When the day&rsquo;s budget runs out nothing breaks: unedited examples show their recorded answer, and live runs return at
          00:00 UTC. Want no limits? Get your own key at{' '}
          <a className="text-brand hover:underline" href={SITE.links.console}>
            console.typesafe.ai
          </a>{' '}
          — at ${PRICING.jev.inPerM} per million input tokens, a session costs a fraction of a cent.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="text-xl font-semibold">Every number is one of two kinds</h2>
        <div className="mt-4 grid max-md:grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[16px] border border-border bg-card p-5 shadow-card">
            <span className="rounded-full bg-success-soft px-2 py-0.5 font-mono text-[11px] text-success-text">live</span>
            <h3 className="mt-3 text-[15px] font-semibold">A single run, just now</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              From our server in {SITE.region}, network included, with the versioned model id that answered.
            </p>
          </div>
          <div className="rounded-[16px] border border-border bg-card p-5 shadow-card">
            <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[11px] text-brand-text">replay</span>
            <h3 className="mt-3 text-[15px] font-semibold">A response we recorded</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Shown with its source, model id and date. Some come from TypeSafe&rsquo;s small cookbook demo sets.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Neither is a benchmark. They show the shape of a result; TypeSafe&rsquo;s own claims are quoted as theirs.
        </p>
      </section>

      <section className="mt-12 rounded-[16px] border border-dashed border-border px-5 py-4" aria-label="What this site is not">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Not affiliated with TypeSafe AI.</strong> Their{' '}
          <a className="text-brand hover:underline" href={SITE.links.docs}>
            documentation
          </a>{' '}
          is the authority — where we differ, the docs are right. And not a place for real data: see{' '}
          <Link className="text-brand hover:underline" href="/privacy">
            privacy
          </Link>
          .
        </p>
      </section>

      <details className="group mt-4 rounded-[16px] border border-border bg-card px-5 py-3.5 shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          How it&rsquo;s built
          <span className="text-xs font-normal text-faint group-open:hidden">show</span>
          <span className="hidden text-xs font-normal text-faint group-open:inline">hide</span>
        </summary>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          <li>Next.js on Vercel. One Zod schema mirrors the TypeSafe contract for both the editor and the proxy.</li>
          <li>Rate limits and the spend cap run on Upstash Redis. Spend is reserved from an estimate, then settled against the real bill.</li>
          <li>
            The error fixtures in <span className="font-mono text-xs">content/recorded/errors</span> are real API rejections captured
            on purpose, so the linter knows which limits are enforced.
          </li>
        </ul>
      </details>

      <section className="mt-12 flex flex-col gap-4 rounded-[16px] border bg-pastel-4 p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">Built and paid for by</p>
          <a href={SITE.links.lyzr} target="_blank" rel="noreferrer" className="mt-2 inline-block hover:opacity-80" aria-label="Lyzr (opens lyzr.ai)">
            <LyzrLogo className="h-9" alt="Lyzr" />
          </a>
        </div>
        <a href={SITE.links.lyzr} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
          lyzr.ai ↗
        </a>
      </section>

      <section className="mt-10 rounded-[16px] border border-border bg-card p-5 shadow-card">
        <h2 className="text-xl font-semibold">Start somewhere</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/play">Open the playground</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/learn">Take the six lessons</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/limits">Where it breaks</Link>
          </Button>
        </div>
      </section>

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">{SITE.provenance}</p>
    </PageShell>
  )
}
