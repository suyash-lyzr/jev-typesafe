import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/chrome'
import { Gauge, MessageSquareOff, Receipt, Scale, Tag, Target, Timer, TrendingUp } from 'lucide-react'
import { LaunchButton } from '@/components/launch-button'
import { Race } from '@/components/visuals/visuals'
import { IconCard } from '@/components/visuals/icon-card'
import { PRICING } from '@/lib/pricing'
import { LIMITS } from '@/lib/guards'
import { LLM_MODELS, LLM_PRICES_CHECKED_ON, LLM_PRICES_SOURCE } from '@/lib/llm-models'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Jev next to an LLM',
  description:
    'How Jev Lab measures Jev against an OpenAI model on the same request — and what the comparison cannot tell you.',
}

const TRY = [
  { preset: 'first-run', label: 'First run · Stripe ticket' },
  { preset: 'support-triage', variant: 'ambiguous', label: 'Support triage · ambiguous' },
  { preset: 'model-routing', label: 'Intent routing' },
  { preset: 'resume-screening', label: 'Resume screening' },
]

export default function ComparePage() {

  return (
    <PageShell>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Jev next to an LLM</h1>
      <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground">
        One request, sent to Jev and your pick of {LLM_MODELS.length} OpenAI models at the same moment. Both answers, both
        latencies, both costs. Each network gets {LIMITS.compare.perDay} free comparisons a day.
      </p>

      <section className="mt-8 flex flex-wrap items-center gap-2" aria-label="Run a comparison">
        {TRY.map((t) => (
          <LaunchButton key={t.label} preset={t.preset} variant={t.variant} mode="compare">
            {t.label}
          </LaunchButton>
        ))}
        <span className="text-xs text-faint">Opens the playground and runs once.</span>
      </section>

      <section className="mt-10 rounded-[16px] border border-border bg-card p-6 shadow-card" aria-labelledby="race-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="race-heading" className="text-[17px] font-semibold">Same question, three models</h2>
          <span className="text-[12px] text-faint">average latency · drawn to scale</span>
        </div>
        <Race
          className="mt-5"
          lanes={[
            { label: 'jev-1.13.0', ms: 111, strong: true },
            { label: 'gpt-5.4-mini', ms: 1410 },
            { label: 'gpt-5.5 · reasoning', ms: 11122 },
          ]}
        />
        <p className="mt-4 text-[11.5px] text-faint">
          TypeSafe&rsquo;s consistency cookbook, 2026-09-11, 15 runs: Jev averaged 111 ms; the others are its 12.7× and
          100.2× slowdowns applied to that. Theirs, not ours — run your own below.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="measure-heading">
        <h2 id="measure-heading" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          How we measure
        </h2>
        <ol className="mt-3 grid max-md:grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { Icon: Timer, title: 'Same moment', body: 'Both calls leave one server function together.' },
            { Icon: Gauge, title: 'Own stopwatch', body: 'Each side times its own call, body included.' },
            { Icon: Tag, title: 'Real model id', body: 'Both sides report the model id that answered. The LLM uses Structured Outputs, no retries, its fastest reasoning setting.' },
            { Icon: Receipt, title: 'List-price cost', body: 'Tokens × the prices below. Jev’s output is free.' },
          ].map(({ Icon, title, body }, i) => (
            <li key={title} className="relative">
              <IconCard Icon={Icon} title={`${i + 1}. ${title}`} className="h-full">
                {body}
              </IconCard>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="cant-heading">
        <h2 id="cant-heading" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          What one run can&rsquo;t tell you
        </h2>
        <div className="mt-3 grid max-md:grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <IconCard Icon={Target} title="Accuracy">Agreeing isn&rsquo;t being right.</IconCard>
          <IconCard Icon={Scale} title="Calibration">That takes many runs.</IconCard>
          <IconCard Icon={TrendingUp} title="A trend">One run, one region, network included.</IconCard>
          <IconCard Icon={MessageSquareOff} title="LLM confidence">A number it writes isn&rsquo;t a distribution.</IconCard>
        </div>
      </section>

      <details className="group mt-10 rounded-[16px] border border-border bg-card px-5 py-4 shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between font-display text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
          Other people&rsquo;s numbers
          <span className="text-xs font-normal text-faint group-open:hidden">show</span>
        </summary>
        <ul className="mt-3 max-w-[70ch] space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">TypeSafe:</strong> 193.6× faster and 444.6× cheaper on
            their own System One workflows; 40–200× faster as the real-world range, and 70–500 ms end to
            end, per the{' '}
            <a className="text-brand hover:underline" href={SITE.links.launchPost}>
              launch post
            </a>
            .
          </li>
          <li>
            <strong className="text-foreground">Community:</strong> the{' '}
            <a className="text-brand hover:underline" href={SITE.links.communityBenchmark}>
              jev-test harness
            </a>{' '}
            found Jev about 3× faster than GPT-5.6 Terra and 7.5× faster than Claude Opus 5, at about
            35× and 190× lower cost, on 17 easy cases run once.
          </li>
          <li>
            <strong className="text-foreground">TypeSafe&rsquo;s consistency cookbook</strong> (2026-09-11,
            15 runs): gpt-5.4-mini was 12.7× slower and 25.6× costlier; gpt-5.5 with reasoning 100.2×
            slower and 778.9× costlier. Jev averaged 111 ms.
          </li>
        </ul>
        <p className="mt-3 text-xs text-faint">Theirs, not ours, and measured under their conditions.</p>
      </details>

      <section className="mt-4 overflow-hidden rounded-[16px] border bg-card shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-4">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Prices used · per 1M tokens</h2>
          <a className="text-[11.5px] text-faint hover:text-foreground" href={LLM_PRICES_SOURCE} target="_blank" rel="noreferrer">
            OpenAI pricing, checked {LLM_PRICES_CHECKED_ON} ↗
          </a>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">List prices used for the cost figures</caption>
          <thead>
            <tr className="border-y border-border bg-muted/40 text-left font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
              <th scope="col" className="px-5 py-2 font-normal">Model</th>
              <th scope="col" className="px-5 py-2 font-normal">Input</th>
              <th scope="col" className="px-5 py-2 font-normal">Output</th>
              <th scope="col" className="hidden px-5 py-2 font-normal sm:table-cell">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="bg-pastel-1/60">
              <th scope="row" className="px-5 py-2 text-left font-mono text-xs font-medium">jev-1.13.0</th>
              <td className="px-5 py-2 font-mono text-xs tabular">${PRICING.jev.inPerM}</td>
              <td className="px-5 py-2 font-mono text-xs tabular">free</td>
              <td className="hidden px-5 py-2 text-xs text-muted-foreground sm:table-cell">TypeSafe, checked {PRICING.jev.checkedOn}</td>
            </tr>
            {LLM_MODELS.map((m) => (
              <tr key={m.id}>
                <th scope="row" className="px-5 py-2 text-left font-mono text-xs font-normal">{m.id}</th>
                <td className="px-5 py-2 font-mono text-xs tabular">${m.inPerM}</td>
                <td className="px-5 py-2 font-mono text-xs tabular">${m.outPerM}</td>
                <td className="hidden px-5 py-2 text-xs text-muted-foreground sm:table-cell">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">Comparisons run from {SITE.region}.</p>
    </PageShell>
  )
}
