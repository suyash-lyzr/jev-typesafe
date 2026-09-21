'use client'

import * as React from 'react'
import Link from 'next/link'
import { InlineBanner } from '@/components/ui/inline-banner'
import { Button } from '@/components/ui/button'
import { usePlayground } from '@/lib/store'
import { formatUsd, PRICING } from '@/lib/pricing'
import type { Answer } from '@/lib/schema'
import { SITE } from '@/lib/site'

/**
 * Jev next to an LLM.
 *
 * The honest framing matters more than the win: one request each, network
 * included, from one server, on one run. Everything that could flatter either
 * side is labelled rather than smoothed over.
 */

type LlmAnswer = { answer?: string | boolean; level?: number }

function agreement(jev: Answer, llm: LlmAnswer | undefined): { mark: string; label: string } {
  if (!llm) return { mark: '—', label: 'no answer' }

  if (jev.type === 'choice') {
    return llm.answer === jev.choice
      ? { mark: '✓', label: 'same option' }
      : { mark: '✗', label: 'different option' }
  }

  if (jev.type === 'score') {
    // Compare like with like: the LLM picks a level, so round Jev's mean.
    const rounded = Math.round(jev.score)
    return llm.level === rounded
      ? { mark: '✓', label: 'same level' }
      : { mark: '✗', label: `differs (Jev rounds to ${rounded})` }
  }

  const jevSide = jev.noul >= 0.5
  return llm.answer === jevSide
    ? { mark: '✓', label: 'same side of 0.5' }
    : { mark: '✗', label: 'different side' }
}

function jevSummary(a: Answer): string {
  if (a.type === 'choice') return `${a.choice} · ${(a.probabilities[a.choice] ?? 0).toFixed(2)} · conf ${a.confidence.toFixed(2)}`
  if (a.type === 'score') return `${a.score.toFixed(2)} · conf ${a.confidence.toFixed(2)}`
  return a.noul.toFixed(2)
}

function llmSummary(a: LlmAnswer | undefined): string {
  if (!a) return '—'
  if (typeof a.level === 'number') return `level ${a.level}`
  if (typeof a.answer === 'boolean') return a.answer ? 'true' : 'false'
  return String(a.answer ?? '—')
}

export function CompareTab() {
  const { lastRun, run, running, compareOn, setCompareOn } = usePlayground()

  if (!lastRun?.compare) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Send this exact request to Jev and to an OpenAI model at the same moment, and see both
          answers, both latencies and both costs.
        </p>
        <Button
          className="mt-4"
          disabled={running}
          onClick={() => {
            setCompareOn(true)
            run({ compare: true })
          }}
        >
          {running ? 'Running…' : 'Run the comparison'}
        </Button>
      </div>
    )
  }

  const c = lastRun.compare as typeof lastRun.compare & { ok?: boolean; error?: string }
  const llmAnswers = (c.answers ?? {}) as Record<string, LlmAnswer>

  const fasterBy = c.ms > 0 ? c.ms / Math.max(1, lastRun.timing.jevMs) : null
  const cheaperBy = c.costUsd > 0 ? c.costUsd / Math.max(1e-9, lastRun.costUsd) : null

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Same state, same questions, both sent from the same server in the same request.
      </p>

      {c.ok === false && (
        <InlineBanner variant="warning" className="mb-3">
          {c.error ?? 'The LLM half did not return a usable answer.'} The Jev half is unaffected.
        </InlineBanner>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium"> </th>
              <th className="px-3 py-2 font-medium">Jev · {lastRun.model}</th>
              <th className="px-3 py-2 font-medium">LLM · {c.llmModel}</th>
              <th className="px-3 py-2 font-medium">agree</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="px-3 py-2 text-muted-foreground">latency</td>
              <td className="px-3 py-2 font-mono tabular">{lastRun.timing.jevMs} ms</td>
              <td className="px-3 py-2 font-mono tabular">{c.ms ? `${c.ms} ms` : '—'}</td>
              <td className="px-3 py-2 font-mono text-xs tabular">
                {fasterBy ? `${fasterBy.toFixed(1)}× this run` : '—'}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-muted-foreground">cost</td>
              <td className="px-3 py-2 font-mono tabular">{formatUsd(lastRun.costUsd)}</td>
              <td className="px-3 py-2 font-mono tabular">{c.costUsd ? formatUsd(c.costUsd) : '—'}</td>
              <td className="px-3 py-2 font-mono text-xs tabular">
                {cheaperBy ? `${cheaperBy.toFixed(1)}× this run` : '—'}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-muted-foreground">tokens</td>
              <td className="px-3 py-2 font-mono text-xs tabular">
                {lastRun.usage.input_tokens} in / {lastRun.usage.output_tokens} out (free)
              </td>
              <td className="px-3 py-2 font-mono text-xs tabular">
                {c.promptTokens} in / {c.completionTokens} out
              </td>
              <td />
            </tr>

            {Object.entries(lastRun.answers).map(([id, answer]) => {
              const { mark, label } = agreement(answer, llmAnswers[id])
              return (
                <tr key={id}>
                  <td className="px-3 py-2 font-mono text-xs">{id}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular">{jevSummary(answer)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{llmSummary(llmAnswers[id])}</td>
                  <td className="px-3 py-2 text-xs">
                    <span aria-hidden>{mark}</span> <span className="text-muted-foreground">{label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p>
          Multipliers are this run only: one request each, from our server in {SITE.region}, network
          included. That is not a benchmark, and it says nothing about which answer is right —
          neither side is graded against truth here.
        </p>
        <p>
          The LLM was asked only for its answer, never for a confidence. A number a model writes in
          its JSON is not a distribution it computed, so there is nothing here to put beside
          Jev&rsquo;s confidence. It also ran at its fastest reasoning setting, with retries off.
        </p>
        <p>
          Prices: Jev ${PRICING.jev.inPerM}/1M input with output free; {c.llmModel} $
          {PRICING.llm.inPerM}/1M in and ${PRICING.llm.outPerM}/1M out, checked{' '}
          {PRICING.checkedOn}. <Link className="text-brand hover:underline" href="/compare">How we measure →</Link>
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={running}
        onClick={() => run({ compare: true })}
      >
        Run again
      </Button>
    </div>
  )
}
