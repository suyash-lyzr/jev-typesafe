'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import type { Answer, Question } from '@/lib/schema'
import type { DecisionSpec } from '@/content/presets'
import { TypeBadge } from './type-badge'

/**
 * The answer, read the way a person reads it: the headline value, then every
 * option with its probability as a black bar, then the question it answers.
 * No collapse — the distribution is the point.
 */

function levelLabels(answer: Answer, question?: Question): string[] {
  if (answer.type !== 'score') return []
  const n = Object.keys(answer.probabilities).length
  return Array.from({ length: n }, (_, i) => {
    const fromLegend = answer.legend?.[String(i)]
    if (typeof fromLegend === 'string' && fromLegend.trim()) return fromLegend
    const fromQuestion = question?.type === 'score' ? question.criteria[i] : undefined
    return typeof fromQuestion === 'string' && fromQuestion.trim() ? fromQuestion : `Level ${i}`
  })
}

function rowsFor(answer: Answer, question?: Question): Array<{ label: string; p: number; top: boolean; hint?: string }> {
  if (answer.type === 'noul') {
    return [
      { label: 'yes', p: answer.noul, top: answer.noul >= 0.5 },
      { label: 'no', p: 1 - answer.noul, top: answer.noul < 0.5 },
    ]
  }
  if (answer.type === 'choice') {
    const described = question?.type === 'choice' ? question.criteria : {}
    return Object.entries(answer.probabilities)
      .sort((a, b) => b[1] - a[1])
      .map(([label, p]) => {
        const d = (described as Record<string, unknown>)[label]
        return { label, p, top: label === answer.choice, hint: typeof d === 'string' ? d : undefined }
      })
  }
  const labels = levelLabels(answer, question)
  const topLevel = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0]
  return labels.map((label, i) => ({ label, p: answer.probabilities[String(i)] ?? 0, top: String(i) === topLevel, hint: `Level ${i}` }))
}

export function headline(answer: Answer): string {
  if (answer.type === 'choice') return answer.choice
  if (answer.type === 'noul') return `${Math.round(answer.noul * 100)}% yes`
  return answer.score.toFixed(2)
}

function Distribution({ answer, question, animateKey }: { answer: Answer; question?: Question; animateKey: string }) {
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    setShown(false)
    const t = setTimeout(() => setShown(true), 60)
    return () => clearTimeout(t)
  }, [animateKey])

  return (
    <ul className="mt-3 space-y-2">
      {rowsFor(answer, question).map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className={cn('min-w-0', row.top ? 'font-medium text-foreground' : 'text-muted-foreground')} title={row.hint}>
              {row.label}
            </span>
            <span className={cn('num shrink-0 text-[13px]', row.top ? 'font-semibold' : 'text-muted-foreground')}>
              {Math.round(row.p * 100)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={cn('h-full rounded-full transition-[width] duration-700 ease-signal', row.top ? 'bg-fill' : 'bg-faint/45')}
              style={{ width: shown ? `${Math.max(row.p * 100, row.p > 0 ? 1 : 0)}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function DecisionCard({
  id,
  answer,
  b,
  question,
  greyed,
  selected,
  onSelect,
  index,
  animateKey,
}: {
  id: string
  answer: Answer
  b?: Answer
  question?: Question
  greyed?: boolean
  selected?: boolean
  onSelect?: () => void
  index: number
  animateKey: string
}) {
  const instructions =
    typeof question?.instructions === 'string'
      ? question.instructions
      : question?.instructions
        ? JSON.stringify(question.instructions)
        : ''

  return (
    <article
      aria-label={`${id} answer`}
      className={cn(
        'rounded-[16px] border bg-card px-5 py-4 shadow-card animate-in fade-in slide-in-from-bottom-1 fill-mode-both',
        selected ? 'border-foreground/60' : 'border-border',
        greyed && 'opacity-50'
      )}
      style={{ animationDelay: `${index * 90}ms`, animationDuration: '400ms' }}
    >
      <header className="flex items-center gap-2">
        <TypeBadge type={answer.type} />
        <span className="min-w-0 truncate font-mono text-[13px] font-medium">{id}</span>
        {greyed && <span className="text-xs text-faint">off the policy path</span>}
        {answer.type !== 'noul' && (
          <span className="ml-auto shrink-0 text-xs text-faint">
            confidence <span className="num text-[13px] font-semibold text-foreground">{Math.round(answer.confidence * 100)}%</span>
          </span>
        )}
      </header>

      <p className="num mt-2 break-words text-[22px] font-semibold leading-tight">{headline(answer)}</p>

      <Distribution answer={answer} question={question} animateKey={animateKey} />

      {b && (
        <div className="mt-4 border-t border-dashed border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Variant B · <span className="num text-foreground">{headline(b)}</span>
            {b.type !== 'noul' && <span className="text-faint"> · confidence {Math.round(b.confidence * 100)}%</span>}
          </p>
          <Distribution answer={b} animateKey={animateKey} />
        </div>
      )}

      {instructions && (
        <button
          type="button"
          onClick={onSelect}
          title="Show this question in the editor"
          className="mt-3 block text-left text-[13px] text-faint hover:text-foreground"
        >
          {instructions}
        </button>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// The simulated policy
// ---------------------------------------------------------------------------

export function measureOf(spec: DecisionSpec, answer: Answer | undefined): number | null {
  if (!answer) return null
  if (spec.measure === 'yes') return answer.type === 'noul' ? answer.noul : null
  if (spec.measure === 'confidence') return answer.type === 'noul' ? null : answer.confidence
  if (spec.measure === 'score') {
    if (answer.type !== 'score') return null
    const top = Math.max(1, Object.keys(answer.probabilities).length - 1)
    return Math.min(1, Math.max(0, answer.score / top))
  }
  return answer.type === 'choice' ? answer.probabilities[spec.measure.option] ?? 0 : null
}

/** A decision for requests that do not name one: the first question, read plainly. */
export function derivedDecision(questions: Record<string, Question>): DecisionSpec | null {
  const entries = Object.entries(questions)
  const noul = entries.find(([, q]) => q.type === 'noul')
  if (noul) {
    return { title: 'Act on the answer', question: noul[0], measure: 'yes', threshold: 0.5, valueLabel: 'yes', above: 'Act on it', below: 'Do nothing' }
  }
  const first = entries[0]
  if (!first) return null
  return {
    title: 'Act without a person',
    question: first[0],
    measure: 'confidence',
    threshold: 0.7,
    valueLabel: 'confident',
    above: 'Act on the answer automatically',
    below: 'Send it to a person',
  }
}

export function PolicyCard({ spec, answer }: { spec: DecisionSpec; answer?: Answer }) {
  const [threshold, setThreshold] = React.useState(spec.threshold)
  React.useEffect(() => setThreshold(spec.threshold), [spec])
  const value = measureOf(spec, answer)
  if (value == null) return null
  const fires = value >= threshold
  const pct = Math.round(threshold * 100)

  return (
    <section
      aria-label="Simulated policy"
      className="rounded-[16px] bg-foreground px-5 py-5 text-background shadow-float animate-in fade-in fill-mode-both"
      style={{ animationDelay: '300ms' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-background/60">
          Simulated policy · {spec.title}
        </p>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-foreground">
          {Math.round(value * 100)}% {spec.valueLabel}
        </span>
      </div>

      <p className="mt-3 font-display text-[20px] font-semibold tracking-[-0.01em]" aria-live="polite">
        → {fires ? spec.above : spec.below}
      </p>

      <p className="mt-4 text-[13px] font-medium text-background/75">
        Trigger when {spec.valueLabel} is {pct}% or higher
      </p>
      <SliderPrimitive.Root
        className="relative mt-2.5 flex h-5 w-full touch-none select-none items-center"
        value={[pct]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => setThreshold(v / 100)}
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-background/20">
          <SliderPrimitive.Range className="absolute h-full bg-background" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={`Threshold for ${spec.valueLabel}`}
          aria-valuetext={`${pct}%`}
          className="block h-[18px] w-[18px] rounded-full border-[3px] border-foreground bg-background shadow ring-1 ring-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/70"
        />
      </SliderPrimitive.Root>

      <p className="mt-4 text-xs leading-relaxed text-background/60">
        Above: {spec.above.toLowerCase()}. Below: {spec.below.toLowerCase()}. Re-decided in your browser — the
        model is not called again.
      </p>
    </section>
  )
}
