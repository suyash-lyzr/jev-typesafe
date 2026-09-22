'use client'

import * as React from 'react'
import Link from 'next/link'
import { InlineBanner } from '@/components/ui/inline-banner'
import { Button } from '@/components/ui/button'
import { usePlayground } from '@/lib/store'
import { formatUsd, JEV_PRICING } from '@/lib/pricing'
import type { Answer } from '@/lib/schema'
import { cn } from '@/lib/utils'
import { TypeBadge } from './type-badge'
import { LlmPicker, QuotaNote, useCompareSetup } from './llm-picker'

/**
 * Jev next to an LLM.
 *
 * The honest framing matters more than the win: one call each, network
 * included, from one server, on one run. A multiplier is only shown when both
 * sides actually answered — a timed-out LLM call is not "250× slower", it is a
 * failure, and is reported as one.
 */

type LlmAnswer = { answer?: string | boolean; level?: number }

function agreement(jev: Answer, llm: LlmAnswer | undefined): { mark: string; label: string } {
  if (!llm) return { mark: '—', label: 'no answer' }

  if (jev.type === 'choice') {
    return llm.answer === jev.choice ? { mark: '✓', label: 'same option' } : { mark: '✗', label: 'different option' }
  }

  if (jev.type === 'score') {
    // Compare like with like: the LLM picks a level, so round Jev's mean.
    const rounded = Math.round(jev.score)
    return llm.level === rounded
      ? { mark: '✓', label: 'same level' }
      : { mark: '✗', label: `differs (Jev rounds to ${rounded})` }
  }

  const jevSide = jev.noul >= 0.5
  return llm.answer === jevSide ? { mark: '✓', label: 'same side of 0.5' } : { mark: '✗', label: 'different side' }
}

function llmSummary(a: LlmAnswer | undefined): string {
  if (!a) return '—'
  if (typeof a.level === 'number') return `level ${a.level}`
  if (typeof a.answer === 'boolean') return a.answer ? 'true' : 'false'
  return String(a.answer ?? '—')
}

export function CompareTab() {
  const { lastRun, run, running, setCompareOn, canRun, compareQuota } = usePlayground()
  useCompareSetup()

  if (!lastRun?.compare) {
    const out = !compareQuota?.owner && compareQuota?.remaining === 0
    return (
      <div className="flex flex-col items-center px-8 py-10 text-center">
        <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
          Send this exact request to Jev and to an OpenAI model at the same moment, from the same server, and see both answers,
          both latencies and both costs.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <LlmPicker />
        </div>
        <Button
          className="mt-4"
          disabled={running || !canRun() || out}
          onClick={() => {
            setCompareOn(true)
            run({ compare: true })
          }}
        >
          {running ? 'Running…' : `Run the comparison`}
        </Button>
        <QuotaNote className="mt-2.5" />
      </div>
    )
  }

  const c = lastRun.compare
  const llmAnswers = (c.answers ?? {}) as Record<string, LlmAnswer>
  const llmOk = c.ok !== false
  const jevMs = lastRun.timing?.jevMs ?? 0
  const jevCost = lastRun.costUsd ?? 0

  // Only when both sides produced an answer and a positive measurement.
  const fasterBy = llmOk && c.ms > 0 && jevMs > 0 ? c.ms / jevMs : null
  const cheaperBy = llmOk && c.costUsd > 0 && jevCost > 0 ? c.costUsd / jevCost : null
  const pricing = c.pricing

  const rows = Object.entries(lastRun.answers).map(([id, answer]) => ({
    id,
    answer,
    llm: llmAnswers[id],
    agree: llmOk ? agreement(answer, llmAnswers[id]) : { mark: '—', label: 'no LLM answer' },
  }))
  const matched = rows.filter((r) => r.agree.mark === '✓').length

  return (
    <div className="space-y-4 p-4">
      {!llmOk && (
        <InlineBanner variant="warning">
          {c.error ?? 'The LLM half did not return a usable answer.'} The Jev half is unaffected.
        </InlineBanner>
      )}

      {/* Headline: the two numbers people came for */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Duel
          title="Speed"
          tone="bg-pastel-1"
          multiple={fasterBy}
          verb="faster"
          jev={{ label: lastRun.model, value: jevMs, text: `${jevMs} ms` }}
          llm={{ label: c.llmModel, value: llmOk ? c.ms : 0, text: llmOk && c.ms ? `${c.ms.toLocaleString()} ms` : '—' }}
        />
        <Duel
          title="Cost"
          tone="bg-pastel-2"
          multiple={cheaperBy}
          verb="cheaper"
          jev={{ label: lastRun.model, value: jevCost, text: formatUsd(jevCost) }}
          llm={{ label: c.llmModel, value: c.costUsd ?? 0, text: c.costUsd ? formatUsd(c.costUsd) : '—' }}
        />
      </div>

      {/* Answers, side by side */}
      <section className="shadow-card overflow-hidden rounded-[16px] border bg-card" aria-label="Answers from both models">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-[14px] font-semibold">Answers</h3>
          {llmOk && (
            <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="flex gap-1" aria-hidden>
                {rows.map((r) => (
                  <span key={r.id} className={cn('h-2 w-2 rounded-full', r.agree.mark === '✓' ? 'bg-foreground' : 'bg-border')} />
                ))}
              </span>
              <span>
                <span className="num font-semibold text-foreground">{matched}</span> of {rows.length} match
              </span>
            </span>
          )}
        </header>
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-4 border-b border-border bg-muted/40 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
          <span>Question</span>
          <span>Jev</span>
          <span className="truncate">{c.llmModel}</span>
          <span className="sr-only">Agreement</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map(({ id, answer, llm, agree }) => {
            const same = agree.mark === '✓'
            return (
              <li key={id} className={cn('grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3', agree.mark === '✗' && 'bg-pastel-2/60')}>
                <span className="flex min-w-0 items-center gap-2">
                  <TypeBadge type={answer.type} className="h-5 shrink-0 px-1.5 text-[9.5px]" />
                  <span className="truncate font-mono text-[12.5px]" title={id}>
                    {id}
                  </span>
                </span>
                <JevCell answer={answer} />
                <span className="truncate font-mono text-[13px]" title={llmSummary(llm)}>
                  {llmOk ? llmSummary(llm) : '—'}
                </span>
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px]',
                    same ? 'bg-foreground text-background' : agree.mark === '✗' ? 'border border-border text-muted-foreground' : 'text-faint'
                  )}
                  title={agree.label}
                  aria-label={agree.label}
                >
                  {agree.mark}
                </span>
              </li>
            )
          })}
        </ul>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span>
            Jev {lastRun.usage ? `${lastRun.usage.input_tokens} in · output free` : '—'}
          </span>
          <span>
            {c.llmModel} {c.promptTokens || c.completionTokens ? `${c.promptTokens} in · ${c.completionTokens} out` : '—'}
          </span>
        </footer>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" disabled={running || !canRun() || (!compareQuota?.owner && compareQuota?.remaining === 0)} onClick={() => run({ compare: true })}>
            Run again
          </Button>
          <LlmPicker />
          <QuotaNote />
        </span>
        <Link className="text-[12.5px] text-muted-foreground hover:text-foreground" href="/compare">
          How we measure →
        </Link>
      </div>

      <details className="group rounded-[12px] border border-dashed border-border px-4 py-2.5 text-xs text-muted-foreground">
        <summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>One run, not a benchmark. What these numbers mean</span>
          <span className="text-faint group-open:hidden">show</span>
          <span className="hidden text-faint group-open:inline">hide</span>
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            Same state and questions, sent to both at the same moment from the same server; each call is timed on its own, network
            included. Multipliers are this run only. Neither side is graded against truth, so &ldquo;match&rdquo; means only that the
            two agreed.
          </p>
          <p>
            The LLM was asked only for its answer, never for a confidence: a number a model writes in its JSON is not a distribution
            it computed. It ran at its fastest reasoning setting, with retries off. Scores are compared by rounding Jev&rsquo;s mean
            to the nearest level; Nouls by which side of 0.5 they fall.
          </p>
          <p>
            Prices: Jev ${JEV_PRICING.inPerM}/1M input, output free.{' '}
            {pricing
              ? `${pricing.id} $${pricing.inPerM}/1M in and $${pricing.outPerM}/1M out — ${
                  pricing.confirmedOn ? `checked ${pricing.confirmedOn}` : 'an assumed price, not yet confirmed'
                }.`
              : null}
          </p>
        </div>
      </details>
    </div>
  )
}

/** One headline measure: the multiple, and two bars drawn to scale. */
function Duel({
  title,
  tone,
  multiple,
  verb,
  jev,
  llm,
}: {
  title: string
  tone: string
  multiple: number | null
  verb: string
  jev: { label: string; value: number; text: string }
  llm: { label: string; value: number; text: string }
}) {
  const max = Math.max(jev.value, llm.value) || 1
  const bar = (v: number, strong: boolean) => (
    <span className="block h-2 overflow-hidden rounded-full bg-card/80" aria-hidden>
      <span
        className={cn('block h-full rounded-full transition-[width] duration-700 ease-signal', strong ? 'bg-foreground' : 'bg-faint/50')}
        style={{ width: `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%` }}
      />
    </span>
  )
  return (
    <div className={cn('shadow-card rounded-[16px] border p-4', tone)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground">this run</span>
      </div>
      <p className="mt-1.5 leading-none">
        {multiple ? (
          <>
            <span className="num text-[30px] font-semibold tracking-[-0.02em]">{multiple.toFixed(1)}×</span>{' '}
            <span className="text-[13px] text-foreground/80">{verb}</span>
          </>
        ) : (
          <span className="text-[13px] text-muted-foreground">No comparison this run</span>
        )}
      </p>
      <div className="mt-3.5 space-y-2.5">
        {[
          { side: 'Jev', ...jev, strong: true },
          { side: 'LLM', ...llm, strong: false },
        ].map((r) => (
          <div key={r.side}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
              <span className={cn('truncate', r.strong ? 'font-medium text-foreground' : 'text-muted-foreground')}>{r.side}</span>
              <span className="num shrink-0 font-medium">{r.text}</span>
            </div>
            {bar(r.value, r.strong)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Jev's side of a row: the answer, and how sure it was, as a small bar. */
function JevCell({ answer }: { answer: Answer }) {
  const [label, p, note] =
    answer.type === 'choice'
      ? [answer.choice, answer.probabilities[answer.choice] ?? 0, `conf ${answer.confidence.toFixed(2)}`]
      : answer.type === 'score'
        ? [answer.score.toFixed(2), answer.confidence, `conf ${answer.confidence.toFixed(2)}`]
        : [`${Math.round(answer.noul * 100)}% yes`, answer.noul, 'P(yes)']
  return (
    <span className="min-w-0">
      <span className="flex items-baseline gap-2">
        <span className="truncate font-mono text-[13px] font-medium" title={String(label)}>
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-faint">{note}</span>
      </span>
      <span className="mt-1 block h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-fill" style={{ width: `${Math.round(p * 100)}%` }} />
      </span>
    </span>
  )
}
