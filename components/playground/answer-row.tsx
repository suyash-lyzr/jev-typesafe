'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Answer } from '@/lib/schema'
import { TypeBadge } from './type-badge'

/**
 * One answer as a capsule row: id and type on the left, one bar, the value on
 * the right. The compact reading of an answer — the full distribution lives in
 * AnswerView, one click away in the playground.
 *
 * The bar always means "how much of the way": the chosen option's probability
 * for a Choice, the score's position between its lowest and highest level for
 * a Score, P(yes) for a Noul.
 */

function levelText(legend: Record<string, unknown> | undefined, level: number): string | null {
  const v = legend?.[String(level)]
  if (typeof v === 'string' && v.trim()) return v
  return null
}

export function describeAnswer(answer: Answer): { value: string; caption: string; fill: number } {
  if (answer.type === 'choice') {
    const p = answer.probabilities[answer.choice] ?? 0
    return {
      value: answer.choice,
      caption: `${Math.round(p * 100)}% · conf ${answer.confidence.toFixed(2)}`,
      fill: p,
    }
  }
  if (answer.type === 'score') {
    const top = Math.max(1, Object.keys(answer.probabilities).length - 1)
    const nearest = levelText(answer.legend, Math.round(answer.score))
    return {
      value: answer.score.toFixed(2),
      caption: nearest ? `“${nearest.length > 28 ? nearest.slice(0, 27) + '…' : nearest}”` : `of ${top}`,
      fill: Math.min(1, Math.max(0, answer.score / top)),
    }
  }
  return { value: answer.noul.toFixed(2), caption: 'probability of yes', fill: answer.noul }
}

export function AnswerRow({
  id,
  answer,
  visible = true,
  delayMs = 0,
  className,
}: {
  id: string
  answer: Answer
  /** Rows can be revealed in sequence; hidden rows keep their space. */
  visible?: boolean
  delayMs?: number
  className?: string
}) {
  const { value, caption, fill } = describeAnswer(answer)
  const [filled, setFilled] = React.useState(false)

  React.useEffect(() => {
    if (!visible) {
      setFilled(false)
      return
    }
    const t = setTimeout(() => setFilled(true), delayMs + 120)
    return () => clearTimeout(t)
  }, [visible, delayMs, answer])

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-3.5 py-3 transition-[opacity,transform] duration-500 sm:grid-cols-[140px_minmax(0,1fr)_minmax(120px,auto)]',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
        className
      )}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      <div className="flex min-w-0 flex-col items-start gap-1">
        <TypeBadge type={answer.type} className="h-5 text-[10px]" />
        <p className="max-w-full truncate font-mono text-[13px] font-medium">{id}</p>
      </div>
      <div
        className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1"
        role="meter"
        aria-label={`${id}: ${value}`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(fill.toFixed(2))}
      >
        <div
          className="h-full rounded-full bg-fill transition-[width] duration-700 ease-signal"
          style={{ width: filled ? `${Math.round(fill * 100)}%` : '0%' }}
        />
      </div>
      <div className="min-w-0 text-right">
        <p className="num truncate text-[17px] font-semibold">{value}</p>
        <p className="truncate text-[11.5px] text-faint">{caption}</p>
      </div>
    </div>
  )
}

/** The in-flight state: a pixel grid, shimmer text and real elapsed time. */
export function DecidingLoader({ label = 'Deciding', className }: { label?: string; className?: string }) {
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    const t0 = performance.now()
    const t = setInterval(() => setElapsed(performance.now() - t0), 100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className={cn('flex items-center gap-2.5 text-[13.5px] text-muted-foreground', className)} role="status">
      <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            className="block h-1 w-1 rounded-[1px] bg-faint"
            style={{ animation: `pixel-pulse 1.2s ${(i % 3) * 0.15}s infinite` }}
          />
        ))}
      </span>
      <span className="shimmer-text font-medium">{label}</span>
      <span className="font-mono text-xs tabular">{(elapsed / 1000).toFixed(1)}s</span>
    </div>
  )
}
