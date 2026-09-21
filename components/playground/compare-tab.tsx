'use client'

import * as React from 'react'
import Link from 'next/link'
import { InlineBanner } from '@/components/ui/inline-banner'
import { Button } from '@/components/ui/button'
import { usePlayground } from '@/lib/store'
import { formatUsd, JEV_PRICING } from '@/lib/pricing'
import type { Answer } from '@/lib/schema'

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
  const { lastRun, run, running, setCompareOn, canRun } = usePlayground()

  if (!lastRun?.compare) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Send this exact request to Jev and to an OpenAI model at the same moment, from the same
          server, and see both answers, both latencies and both costs.
        </p>
        <Button
          className="mt-4"
          disabled={running || !canRun()}
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

  const c = lastRun.compare
  const llmAnswers = (c.answers ?? {}) as Record<string, LlmAnswer>
  const llmOk = c.ok !== false
  const jevMs = lastRun.timing?.jevMs ?? 0
  const jevCost = lastRun.costUsd ?? 0

  // Only when both sides produced an answer and a positive measurement.
  const fasterBy = llmOk && c.ms > 0 && jevMs > 0 ? c.ms / jevMs : null
  const cheaperBy = llmOk && c.costUsd > 0 && jevCost > 0 ? c.costUsd / jevCost : null
  const pricing = c.pricing

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Same state, same questions, sent to both at the same moment from the same server — two
        separate calls, each timed on its own.
      </p>

      {!llmOk && (
        <InlineBanner variant="warning" className="mb-3">
          {c.error ?? 'The LLM half did not return a usable answer.'} The Jev half is unaffected.
        </InlineBanner>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Jev and {c.llmModel} on the same request</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">Jev · {lastRun.model}</th>
              <th scope="col" className="px-3 py-2 font-medium">LLM · {c.llmModel}</th>
              <th scope="col" className="px-3 py-2 font-medium">agree</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">latency</th>
              <td className="px-3 py-2 font-mono tabular">{jevMs} ms</td>
              <td className="px-3 py-2 font-mono tabular">{llmOk && c.ms ? `${c.ms} ms` : '—'}</td>
              <td className="px-3 py-2 font-mono text-xs tabular">{fasterBy ? `${fasterBy.toFixed(1)}× this run` : '—'}</td>
            </tr>
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">cost</th>
              <td className="px-3 py-2 font-mono tabular">{formatUsd(jevCost)}</td>
              <td className="px-3 py-2 font-mono tabular">{c.costUsd ? formatUsd(c.costUsd) : '—'}</td>
              <td className="px-3 py-2 font-mono text-xs tabular">{cheaperBy ? `${cheaperBy.toFixed(1)}× this run` : '—'}</td>
            </tr>
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">tokens</th>
              <td className="px-3 py-2 font-mono text-xs tabular">
                {lastRun.usage ? `${lastRun.usage.input_tokens} in / ${lastRun.usage.output_tokens} out (output free)` : '—'}
              </td>
              <td className="px-3 py-2 font-mono text-xs tabular">
                {c.promptTokens || c.completionTokens ? `${c.promptTokens} in / ${c.completionTokens} out` : '—'}
              </td>
              <td />
            </tr>

            {Object.entries(lastRun.answers).map(([id, answer]) => {
              const { mark, label } = llmOk ? agreement(answer, llmAnswers[id]) : { mark: '—', label: 'no LLM answer' }
              return (
                <tr key={id}>
                  <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-normal">{id}</th>
                  <td className="px-3 py-2 font-mono text-xs tabular">{jevSummary(answer)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{llmOk ? llmSummary(llmAnswers[id]) : '—'}</td>
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
          Multipliers are this run only: one call each, network included. That is not a benchmark,
          and it says nothing about which answer is right — neither side is graded against truth
          here, so &ldquo;agree&rdquo; means only that the two matched.
        </p>
        <p>
          The LLM was asked only for its answer, never for a confidence: a number a model writes in
          its JSON is not a distribution it computed. It ran at its fastest reasoning setting, with
          retries off.
        </p>
        <p>
          Prices: Jev ${JEV_PRICING.inPerM}/1M input, output free.{' '}
          {pricing ? (
            <>
              {pricing.id} ${pricing.inPerM}/1M in and ${pricing.outPerM}/1M out —{' '}
              {pricing.confirmedOn ? `checked ${pricing.confirmedOn}` : 'an assumed price, not yet confirmed against OpenAI’s pricing page'}.
            </>
          ) : null}{' '}
          <Link className="text-brand hover:underline" href="/compare">
            How we measure →
          </Link>
        </p>
      </div>

      <Button variant="outline" size="sm" className="mt-3" disabled={running || !canRun()} onClick={() => run({ compare: true })}>
        Run again
      </Button>
    </div>
  )
}
