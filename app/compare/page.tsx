import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/chrome'
import { LaunchButton } from '@/components/launch-button'
import { PRICING } from '@/lib/pricing'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Jev next to an LLM',
  description:
    'How Jev Lab measures Jev against an OpenAI model on the same request — and what the comparison cannot tell you.',
}

const TRY = [
  { preset: 'first-run', label: 'First run · Stripe ticket' },
  { preset: 'support-triage', variant: 'ambiguous', label: 'Support triage · ambiguous' },
  { preset: 'model-routing', label: 'Model routing' },
  { preset: 'resume-screening', label: 'Resume screening' },
]

export default function ComparePage() {
  const llm = PRICING.llm

  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Jev next to an LLM</h1>
      <p className="mt-2 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        The same state and the same questions, sent to Jev and to an OpenAI model at the same moment
        from the same server — two separate calls, each timed on its own. You see both answers, both
        latencies and both costs.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Try it</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each button opens the playground with the comparison on and runs it once. Comparisons are
          capped tighter than plain runs, because they spend on two providers.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TRY.map((t) => (
            <LaunchButton key={t.label} preset={t.preset} variant={t.variant} mode="compare">
              {t.label}
            </LaunchButton>
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
              other, and a failure on one side never blocks the other.
            </li>
            <li>
              Each side is timed the same way: its own network call, including reading the response
              body — not our serialisation, not the page render.
            </li>
            <li>
              Jev: <code className="font-mono text-xs">POST /v1/systemone</code>. We print the
              versioned model id from the response, never the alias we asked for.
            </li>
            <li>
              The LLM: {llm.id} with Structured Outputs — a JSON schema built from your questions —
              retries off, output capped, and the <em>fastest</em> reasoning setting the model offers.
              Slowing it down would make the multiplier meaningless.
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
              graded against a right answer. Agreement marks say the two matched, not that either was
              correct.
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
              <strong className="text-foreground">We never ask the LLM for a confidence.</strong> A
              number a model writes into its JSON is not a distribution it computed, and putting one
              beside Jev&rsquo;s confidence would imply they mean the same thing.
            </li>
            <li>
              <strong className="text-foreground">A small model is not a frontier model.</strong>{' '}
              The published figures below measured different opponents under different conditions.
            </li>
          </ul>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Other people&rsquo;s numbers, with their conditions</h2>
        <ul className="mt-3 max-w-[70ch] space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">TypeSafe&rsquo;s own claim:</strong> 193.6× faster and
            444.6× cheaper, &ldquo;based on workflows for System One tasks&rdquo;, from evaluations run
            by their own team. The{' '}
            <a className="text-brand hover:underline" href={SITE.links.launchPost}>
              launch post
            </a>{' '}
            calls this the higher end of real-world gains and gives 40–200× faster as the range. The
            same post puts Jev&rsquo;s end-to-end response time at 70–500 ms.
          </li>
          <li>
            <strong className="text-foreground">A community test:</strong> the{' '}
            <a className="text-brand hover:underline" href={SITE.links.communityBenchmark}>
              jev-test harness on GitHub
            </a>{' '}
            ran 17 clear-cut cases once and found Jev about 3× faster than GPT-5.6 Terra and 7.5×
            faster than Claude Opus 5, at about 35× and 190× lower cost, with all three getting every
            case right. Its authors call it a single run on a small, easy set.
          </li>
          <li>
            <strong className="text-foreground">TypeSafe&rsquo;s consistency cookbook</strong>{' '}
            (2026-09-11, a 14-Noul rubric over 15 runs, their own price assumptions): gpt-5.4-mini at
            temperature 0 was 12.7× slower and 25.6× costlier than Jev; gpt-5.5 with reasoning was
            100.2× slower and 778.9× costlier. Jev averaged 111 ms and $0.000043 per call.
          </li>
        </ul>
        <p className="mt-3 max-w-[70ch] text-xs text-muted-foreground">
          These are theirs, not ours, and none of them is what this page measures.
        </p>
      </section>

      <section className="mt-10 rounded-lg border border-border bg-card p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prices used</h2>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">List prices used for the cost figures</caption>
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="py-2 text-left font-mono text-xs font-normal">jev-1.13.0</th>
              <td className="py-2 font-mono text-xs tabular">${PRICING.jev.inPerM} / 1M input</td>
              <td className="py-2 font-mono text-xs tabular">output free</td>
              <td className="py-2 text-xs text-muted-foreground">checked {PRICING.jev.checkedOn}</td>
            </tr>
            <tr>
              <th scope="row" className="py-2 text-left font-mono text-xs font-normal">{llm.id}</th>
              <td className="py-2 font-mono text-xs tabular">${llm.inPerM} / 1M input</td>
              <td className="py-2 font-mono text-xs tabular">${llm.outPerM} / 1M output</td>
              <td className="py-2 text-xs text-muted-foreground">
                {llm.confirmedOn ? `checked ${llm.confirmedOn}` : 'assumed — TypeSafe’s cookbook figure, not yet confirmed'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Comparisons run from {SITE.region}. {SITE.disclaimer}
      </p>
    </PageShell>
  )
}
