'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { AnswerView } from '@/components/playground/answer-views'
import { ConfidenceChip } from '@/components/playground/answer-views'
import { firstRun } from '@/content/presets/first-run'
import { formatUsd } from '@/lib/pricing'
import type { Answer, RunError } from '@/lib/schema'
import { errorCardCopy } from '@/lib/errors'
import { InlineBanner } from '@/components/ui/inline-banner'

/**
 * The landing card.
 *
 * It opens on a recorded answer so the page is useful before anyone spends
 * anything, and says so. One click replaces it with a live run — and because
 * the live numbers differ slightly from the recorded ones, the swap teaches
 * the point of the whole site before the reader has read a word about it.
 */

const variant = firstRun.variants[0]
const recorded = variant.recorded!

export function FirstRunCard() {
  const [answers, setAnswers] = React.useState<Record<string, Answer>>(recorded.answers)
  const [live, setLive] = React.useState<{
    model: string
    jevMs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
  } | null>(null)
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<RunError | null>(null)

  async function runLive() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/jev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: { state: variant.state, model: 'jev-latest', questions: firstRun.questions },
          feature: 'landing',
          presetId: firstRun.slug,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body as RunError)
        return
      }
      setAnswers(body.answers)
      setLive({
        model: body.model,
        jevMs: body.timing.jevMs,
        inputTokens: body.usage.input_tokens,
        outputTokens: body.usage.output_tokens,
        costUsd: body.costUsd,
      })
    } catch {
      setError({ error: 'network', message: 'Could not reach the server.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          First run
        </h2>
        {live ? (
          <Chip variant="brand">LIVE</Chip>
        ) : (
          <Chip variant="default" title={`Recorded on ${recorded.date} from ${recorded.model}, not computed now.`}>
            replay · recorded {recorded.date}
          </Chip>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">State</p>
        <p className="mt-1 text-sm leading-relaxed">{String(variant.state)}</p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Questions
        </p>
        <ul className="mt-1 space-y-1">
          {Object.entries(firstRun.questions).map(([id, q]) => (
            <li key={id} className="flex items-baseline gap-2 text-xs">
              <Chip variant="outline">{q.type.toUpperCase()}</Chip>
              <span className="font-mono">{id}</span>
              <span className="truncate text-muted-foreground">{String(q.instructions)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        {Object.entries(answers).map(([id, answer]) => (
          <div key={id}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium">{id}</span>
              <Chip variant="outline">{answer.type.toUpperCase()}</Chip>
              {answer.type !== 'noul' && <ConfidenceChip confidence={answer.confidence} />}
            </div>
            <div className="mt-1.5">
              <AnswerView answer={answer} showGuide={false} />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <InlineBanner variant="warning" className="mt-3">
          {errorCardCopy(error).body}
        </InlineBanner>
      )}

      <p className="mt-4 border-t border-border pt-3 font-mono text-[11px] tabular text-muted-foreground">
        {live
          ? `${live.model} · ${live.jevMs} ms · ${live.inputTokens} in / ${live.outputTokens} out · ${formatUsd(live.costUsd)}`
          : `${recorded.model} · recorded · ${recorded.usage?.input_tokens} in / ${recorded.usage?.output_tokens} out`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={runLive} disabled={running}>
          {running ? 'Running…' : live ? 'Run it again' : 'Run it live'}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/play?p=first-run">Edit in the playground →</Link>
        </Button>
      </div>

      {live && (
        <p className="mt-3 text-xs text-muted-foreground">
          {recorded.note}
        </p>
      )}
    </div>
  )
}
