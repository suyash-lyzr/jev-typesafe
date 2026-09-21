import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { TopNav, Footer } from '@/components/layout/chrome'
import { FirstRunCard } from '@/components/landing/first-run-card'
import { SITE } from '@/lib/site'
import { allPresets } from '@/content/presets'
import { PRICING } from '@/lib/pricing'

const FACTS = [
  { value: '70–500 ms', label: 'end to end, per TypeSafe' },
  { value: `$${PRICING.jev.inPerM}/1M`, label: 'input tokens · output free' },
  { value: '3 types', label: 'Choice · Score · Noul' },
  { value: '0 words', label: 'it never generates text' },
]

export default function Home() {
  const teasers = allPresets.filter((p) => p.category !== 'limits').slice(1, 6)

  return (
    <>
      <TopNav />

      <main className="mx-auto max-w-[1100px] px-4 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          A playground for TypeSafe AI&rsquo;s Jev · built by Lyzr · no account needed
        </p>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
              Jev doesn&rsquo;t write.
              <br />
              It decides.
            </h1>

            <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              Send it a state and some typed questions. It hands back probabilities your code can
              branch on — a choice, a score, or a yes/no — in about a tenth of a second. Your code
              makes the final call.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/play">Open the playground</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/learn">Learn it in 5 minutes</Link>
              </Button>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-6">
              {FACTS.map((fact) => (
                <div key={fact.label}>
                  <dt className="font-mono text-2xl font-semibold tabular">{fact.value}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{fact.label}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-6 max-w-[46ch] text-xs text-muted-foreground">
              Latency here is measured from our server, so it includes the network. TypeSafe reports
              70–500 ms end to end.
            </p>
          </div>

          <FirstRunCard />
        </div>

        {/* How it works */}
        <section className="mt-20 border-t border-border pt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            How it works
          </h2>
          <div className="mt-5 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['① State', 'A ticket, a document, a JSON record — whatever your code already has.'],
              ['② Questions', 'Choice, Score and Noul. Each one is judged on its own, in parallel.'],
              ['③ Typed answers', 'A full probability distribution, plus confidence on Choice and Score.'],
              ['④ Your code', 'Thresholds, if/else, escalation. The model never decides anything.'],
            ].map(([title, body]) => (
              <div key={title}>
                <h3 className="text-[15px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Presets */}
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Start with a preset
            </h2>
            <Link href="/presets" className="text-sm text-brand hover:underline">
              All presets →
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teasers.map((preset) => (
              <Link
                key={preset.slug}
                href={`/play?p=${preset.slug}`}
                className="rounded-lg border border-border bg-card p-4 transition-colors duration-fast hover:bg-accent"
              >
                <h3 className="text-[13px] font-medium">{preset.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {preset.teaches}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[...new Set(Object.values(preset.questions).map((q) => q.type))].map((t) => (
                    <Chip key={t} variant="outline">
                      {t.toUpperCase()}
                    </Chip>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Limits + compare */}
        <section className="mt-16 grid gap-6 border-t border-border pt-10 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold">Where it breaks</h2>
            <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              Counting, dates, double negatives, arithmetic, injected instructions. TypeSafe
              documents nine failure modes for jev-1.13; five of them run live here, each next to
              the rewrite that works.
            </p>
            <Link href="/limits" className="mt-3 inline-block text-sm text-brand hover:underline">
              See the limits →
            </Link>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Jev next to an LLM</h2>
            <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              The same state and the same questions, sent to both from the same server in one
              request. You see both answers, both latencies and both costs — and what the
              comparison cannot tell you.
            </p>
            <Link href="/compare" className="mt-3 inline-block text-sm text-brand hover:underline">
              How we measure →
            </Link>
          </div>
        </section>

        <p className="mt-12 text-xs text-muted-foreground">{SITE.disclaimer}</p>
      </main>

      <Footer />
    </>
  )
}
