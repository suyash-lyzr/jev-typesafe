'use client'

import * as React from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AnswerRow, DecidingLoader } from '@/components/playground/answer-row'
import { TypeBadge } from '@/components/playground/type-badge'
import { getPreset, getVariant, USE_CASE_SLUGS } from '@/content/presets'
import { formatUsd } from '@/lib/pricing'
import type { Answer, RunError } from '@/lib/schema'
import { errorCardCopy } from '@/lib/errors'
import { runOnce } from '@/lib/run-once'

/**
 * The landing console.
 *
 * It opens on a use case's recorded answer, labelled as a replay, so the page
 * is useful before anyone spends anything. The state types itself and the
 * rows land — that is the whole pitch, animated once. "Another example" types
 * out the next use case; "Run it live" asks the model for real, with a real
 * elapsed-time loader, and the label flips.
 */

/** A spread of jobs to cycle through, one from each corner of the catalogue. */
const SHOWCASE = ['support-ticket', 'tool-call-gate', 'fraud-check', 'phishing-check', 'agent-next-step', 'search-ranking'].filter(
  (s) => USE_CASE_SLUGS.includes(s)
)

function stateText(state: unknown): string {
  if (typeof state === 'string') return state
  return JSON.stringify(state, null, 2)
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])
  return reduced
}

export function FirstRunCard() {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = React.useState(0)
  const preset = getPreset(SHOWCASE[index])!
  const variant = getVariant(preset)
  const questions = variant.questions ?? preset.questions
  const recorded = variant.recorded ?? null
  const text = stateText(variant.state)

  const [typed, setTyped] = React.useState(0)
  const [revealed, setRevealed] = React.useState(false)
  const [live, setLive] = React.useState<{
    slug: string
    answers: Record<string, Answer>
    model: string
    jevMs: number
    tokens: number
    costUsd: number
  } | null>(null)
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<RunError | null>(null)

  // Type the state, then reveal the recorded answers. Replays on each new example.
  React.useEffect(() => {
    setRevealed(false)
    if (reduced) {
      setTyped(text.length)
      setRevealed(true)
      return
    }
    setTyped(0)
    let i = 0
    const t = setInterval(() => {
      i += 3
      setTyped(Math.min(i, text.length))
      if (i >= text.length) {
        clearInterval(t)
        setTimeout(() => setRevealed(true), 250)
      }
    }, 16)
    return () => clearInterval(t)
  }, [reduced, text])

  async function runLive() {
    setRunning(true)
    setRevealed(false)
    setError(null)
    const out = await runOnce(
      { state: variant.state, model: 'jev-latest', questions },
      { feature: 'landing', presetId: preset.slug, variantId: variant.id }
    )
    setRunning(false)
    if (!out.ok) {
      setError(out.error)
      setRevealed(true)
      return
    }
    setLive({
      slug: preset.slug,
      answers: out.result.answers,
      model: out.result.model,
      jevMs: out.result.timing.jevMs,
      tokens: out.result.usage.input_tokens,
      costUsd: out.result.costUsd,
    })
    setRevealed(true)
  }

  const liveHere = live?.slug === preset.slug ? live : null
  const answers = liveHere?.answers ?? recorded?.answers ?? {}
  const typing = typed < text.length

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-float">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 text-[12.5px] text-muted-foreground">
        <span className={cn('h-[7px] w-[7px] rounded-full', liveHere ? 'bg-success' : 'bg-faint')} aria-hidden />
        <span className="font-medium text-foreground">{preset.title}</span>
        <span className="font-mono text-faint">· {liveHere?.model ?? recorded?.model ?? 'jev-1.13.0'}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 font-mono text-[11px]',
            liveHere ? 'bg-success-soft text-success-text' : 'bg-brand-soft text-brand-text'
          )}
          title={liveHere ? 'Answered just now' : 'A real answer Jev Lab recorded earlier — not computed now'}
        >
          {liveHere ? 'live' : 'replay'}
        </span>
      </div>

      {/* A fixed height, not a min/max: different examples have very different
          state lengths, and the text grows character by character while it
          types. Either would otherwise resize this box continuously, which
          reflows the whole hero column since the grid centers on row height. */}
      <div className="flex h-[184px] flex-col border-b border-dashed border-border px-5 py-4">
        <p className="mb-1.5 shrink-0 font-mono text-[11px] tracking-[0.04em] text-faint">STATE</p>
        <p className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap text-[14px] leading-relaxed">
          {text.slice(0, typed)}
          {typing && <span className="ml-px inline-block h-[1.05em] w-0.5 translate-y-[3px] animate-pulse bg-fill" aria-hidden />}
          <span className="sr-only">{text}</span>
        </p>
      </div>

      <div className="relative grid gap-2 p-2.5">
        {running && (
          <div className="absolute inset-x-0 top-0 z-10 flex h-full items-start bg-card/70 px-3 pt-4 backdrop-blur-[1px]">
            <DecidingLoader />
          </div>
        )}
        {Object.entries(questions).map(([id, q], i) =>
          answers[id] ? (
            <AnswerRow key={`${preset.slug}-${id}`} id={id} answer={answers[id]} visible={revealed} delayMs={i * 140} />
          ) : (
            <div key={id} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3.5 py-3 text-xs text-faint">
              <TypeBadge type={q.type} /> {id}
            </div>
          )
        )}
      </div>

      {error && (
        <p className="mx-4 mb-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-text" role="alert">
          {errorCardCopy(error).body}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-3">
        <p className="font-mono text-xs tabular text-muted-foreground">
          {liveHere
            ? `${liveHere.jevMs} ms · ${liveHere.tokens} tokens · ${formatUsd(liveHere.costUsd)}`
            : recorded?.usage
              ? `${recorded.usage.input_tokens} tokens · recorded ${recorded.date}`
              : ''}
        </p>
        <div className="ml-auto flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIndex((i) => (i + 1) % SHOWCASE.length)
              setError(null)
            }}
            disabled={running}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Another example
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/play?p=${preset.slug}`}>Edit</Link>
          </Button>
          <Button size="sm" onClick={runLive} disabled={running || typing}>
            {running ? 'Running…' : liveHere ? 'Run again' : 'Run it live'}
          </Button>
        </div>
      </div>
    </div>
  )
}
