import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'
import { PRICING } from '@/lib/pricing'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Jev next to an LLM',
  description:
    'How Jev Lab measures Jev against an OpenAI model on the same request — and what the comparison cannot tell you.',
}

export default function ComparePage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Jev next to an LLM</h1>
      <p className="mt-2 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        The same state and the same questions, sent to Jev and to an OpenAI model from the same
        server, in the same request. You see both answers, both latencies and both costs.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Try it
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each of these opens the playground with the comparison switched on.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['first-run', 'First run · Stripe ticket'],
            ['support-triage', 'Support triage · ambiguous'],
            ['llm-guardrail', 'LLM guardrail'],
            ['citation-check', 'Citation check'],
          ].map(([slug, label]) => (
            <Button key={slug} variant="outline" size="sm" asChild>
              <Link href={`/play?p=${slug}&compare=1`}>{label}</Link>
            </Button>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">How we measure</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              Both calls leave the same server function at the same moment, under{' '}
              <code className="font-mono text-xs">Promise.allSettled</code>. Neither waits for the
              other.
            </li>
            <li>
              Each side is timed around its own network call only — not our serialisation, not the
              page render.
            </li>
            <li>
              Jev: <code className="font-mono text-xs">POST /v1/systemone</code> with{' '}
              <code className="font-mono text-xs">jev-latest</code>. We print the versioned model id
              from the response, never the alias we asked for.
            </li>
            <li>
              The LLM: {PRICING.llm.id} with Structured Outputs, a JSON schema built from your
              questions, retries off, and the <em>fastest</em> reasoning setting it offers. Slowing
              it down would make the multiplier meaningless.
            </li>
            <li>
              Cost is tokens × the list prices below. Output tokens are free on Jev&rsquo;s side, so
              only its input is charged.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">What it cannot say</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Nothing about accuracy.</strong> Neither side is
              graded against a right answer here. Agreement marks say the two matched, not that
              either was correct.
            </li>
            <li>
              <strong className="text-foreground">Nothing about calibration.</strong> That is a
              property of many predictions; one run cannot show it.
            </li>
            <li>
              <strong className="text-foreground">It is one run.</strong> Network included, from one
              region, on one request. A different hour gives a different number.
            </li>
            <li>
              <strong className="text-foreground">A mini model is not a frontier model.</strong>{' '}
              TypeSafe&rsquo;s own evals claim 193.6× faster and 444.6× cheaper against frontier
              LLMs; a community benchmark found about 3× faster than GPT-5.6 Terra and 7.5× faster
              than Claude Opus 5, at 35× and 190× lower cost. Those are their numbers, not ours, and
              not what this page measures.
            </li>
            <li>
              <strong className="text-foreground">We never ask the LLM for a confidence.</strong> A
              number a model writes into its JSON is not a distribution it computed, and putting one
              next to Jev&rsquo;s confidence would imply they mean the same thing.
            </li>
          </ul>
        </section>
      </div>

      <section className="mt-10 rounded-lg border border-border bg-card p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Prices used · checked {PRICING.checkedOn}
        </h2>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-2 font-mono text-xs">jev-1.13.0</td>
              <td className="py-2 font-mono text-xs tabular">${PRICING.jev.inPerM} / 1M input</td>
              <td className="py-2 font-mono text-xs tabular">output free</td>
            </tr>
            <tr>
              <td className="py-2 font-mono text-xs">{PRICING.llm.id}</td>
              <td className="py-2 font-mono text-xs tabular">${PRICING.llm.inPerM} / 1M input</td>
              <td className="py-2 font-mono text-xs tabular">${PRICING.llm.outPerM} / 1M output</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          From TypeSafe&rsquo;s own consistency cookbook (2026-09-11, a 14-Noul rubric over 15 runs,
          using their price assumptions): gpt-5.4-mini at temperature 0 was 12.7× slower and 25.6×
          costlier than Jev; gpt-5.5 with reasoning was 100.2× slower and 778.9× costlier. Jev
          averaged 111 ms and $0.000043 per call. Those are their measurements, quoted with their
          conditions.
        </p>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Comparisons run from {SITE.region}. {SITE.disclaimer}
      </p>
    </PageShell>
  )
}
