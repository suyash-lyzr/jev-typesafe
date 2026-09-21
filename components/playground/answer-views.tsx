'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Chip } from '@/components/ui/chip'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Answer, ChoiceAnswer, NoulAnswer, ScoreAnswer } from '@/lib/schema'
import { bandLabel, type Band } from '@/lib/policy'

/**
 * How an answer is read.
 *
 * The distribution is the answer; the label is a summary of it. Every view
 * here shows the whole shape, keeps a text percentage on each row so the bar
 * is never the only carrier, and says in words what the number does and does
 * not mean.
 */

const pct = (p: number) => `${Math.round(p * 100)}%`

/**
 * Non-chosen rows sit at 50%, not 25%: composited over the muted track, 25%
 * lands around 1.5:1 and fails WCAG 1.4.11's 3:1 for non-text contrast.
 */
function Bar({ value, emphasis }: { value: number; emphasis: boolean }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded border border-border bg-muted">
      <div
        className="h-full rounded transition-all duration-base ease-sage"
        style={{
          width: `${Math.max(value * 100, value > 0 ? 1.5 : 0)}%`,
          backgroundColor: emphasis
            ? 'hsl(var(--dataviz-primary))'
            : 'hsl(var(--dataviz-primary) / 0.5)',
        }}
      />
    </div>
  )
}

export function BandChip({ band }: { band: Band }) {
  const variant = band === 'act' ? 'success' : band === 'review' ? 'warning' : 'danger'
  return <Chip variant={variant}>{bandLabel(band)}</Chip>
}

export function ConfidenceChip({ confidence }: { confidence: number }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help font-mono text-xs tabular text-muted-foreground">
            conf {confidence.toFixed(2)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Derived by TypeSafe from how peaked the probability distribution is. It describes the
          answer&rsquo;s shape, not whether it is correct: calibration holds across many answers, not
          this one.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
}

// ---------------------------------------------------------------------------
// Choice
// ---------------------------------------------------------------------------

const CLOSE_CALL_GAP = 0.15
const COLLAPSE_ABOVE = 8

export function ChoiceBars({ answer, showGuide }: { answer: ChoiceAnswer; showGuide: boolean }) {
  const [expanded, setExpanded] = React.useState(false)

  const rows = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])
  const visible = expanded || rows.length <= COLLAPSE_ABOVE ? rows : rows.slice(0, 5)
  const runnerUp = rows[1]
  const closeCall = runnerUp && rows[0][1] - runnerUp[1] < CLOSE_CALL_GAP

  return (
    <div>
      <div className="space-y-1.5">
        {visible.map(([option, p]) => {
          const chosen = option === answer.choice
          return (
            <div
              key={option}
              className="flex items-center gap-3"
              aria-label={`${option}, ${pct(p)}${chosen ? ', chosen' : ''}`}
            >
              <span
                className={cn(
                  'w-32 shrink-0 truncate font-mono text-xs',
                  chosen ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
                title={option}
              >
                {option}
              </span>
              <Bar value={p} emphasis={chosen} />
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular">{pct(p)}</span>
              <span className="w-14 shrink-0 text-xs text-muted-foreground">
                {chosen ? 'chosen' : ''}
              </span>
            </div>
          )
        })}
      </div>

      {rows.length > COLLAPSE_ABOVE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-brand underline-offset-2 hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length} options`}
        </button>
      )}

      {showGuide && closeCall && (
        <Caption>
          Close call: {runnerUp[0]} is within {(rows[0][1] - runnerUp[1]).toFixed(2)} of the top
          option. The label alone would hide that; the distribution does not.
        </Caption>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

function levelText(legend: Record<string, unknown> | undefined, index: string): string {
  const entry = legend?.[index]
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const what = (entry as Record<string, unknown>).what
    if (typeof what === 'string') return what
  }
  return `Level ${index}`
}

export function ScoreLadder({ answer, showGuide }: { answer: ScoreAnswer; showGuide: boolean }) {
  const levels = Object.keys(answer.probabilities).sort((a, b) => Number(a) - Number(b))
  const top = levels.reduce((best, k) =>
    answer.probabilities[k] > answer.probabilities[best] ? k : best
  , levels[0])
  const maxLevel = Math.max(1, Number(levels[levels.length - 1]))

  const arithmetic = levels
    .map((k) => `${k}×${answer.probabilities[k].toFixed(2)}`)
    .join(' + ')

  return (
    <div>
      <div className="space-y-1.5">
        {levels.map((k) => {
          const p = answer.probabilities[k]
          const isTop = k === top
          const text = levelText(answer.legend as Record<string, unknown>, k)
          return (
            <div
              key={k}
              className="flex items-center gap-3"
              aria-label={`level ${k}, ${text}, ${pct(p)}`}
            >
              <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{k}</span>
              <span
                className={cn(
                  'w-44 shrink-0 truncate text-xs',
                  isTop ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
                title={text}
              >
                {text}
              </span>
              <Bar value={p} emphasis={isTop} />
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular">{pct(p)}</span>
              <span className="w-8 shrink-0 text-xs text-muted-foreground">
                {isTop ? 'top' : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* The ruler: where the mean actually landed between the levels. */}
      <div className="mt-4 pl-5">
        <div
          className="relative h-6"
          role="meter"
          aria-valuenow={answer.score}
          aria-valuemin={0}
          aria-valuemax={maxLevel}
          aria-valuetext={`mean ${answer.score.toFixed(2)} of ${maxLevel}`}
        >
          <div className="absolute inset-x-0 top-3 h-px bg-border" />
          {levels.map((k) => (
            <span
              key={k}
              className="absolute top-1.5 h-2 w-px bg-border"
              style={{ left: `${(Number(k) / maxLevel) * 100}%` }}
            />
          ))}
          <span
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] leading-none text-foreground"
            style={{ left: `${(answer.score / maxLevel) * 100}%` }}
            aria-hidden
          >
            ▲
          </span>
          <span
            className="absolute top-3.5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tabular text-muted-foreground"
            style={{ left: `${(answer.score / maxLevel) * 100}%` }}
            aria-hidden
          >
            mean {answer.score.toFixed(2)}
          </span>
        </div>
      </div>

      {showGuide && (
        <Caption>
          {arithmetic} = {answer.score.toFixed(2)}. The score is a probability-weighted mean, so a
          score of 1.0 could be all of level 1, or half of level 0 and half of level 2. Read the
          bars, not just the number.
        </Caption>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Noul
// ---------------------------------------------------------------------------

export function NoulTrack({
  answer,
  showGuide,
  yes = 0.8,
  no = 0.2,
}: {
  answer: NoulAnswer
  showGuide: boolean
  yes?: number
  no?: number
}) {
  const v = answer.noul
  const zone = v >= yes ? 'yes' : v <= no ? 'no' : 'unsure'

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tabular">{v.toFixed(2)}</span>
        <span className="text-sm text-muted-foreground">
          probability of yes &middot; <span className="text-foreground">{zone}</span>
        </span>
      </div>

      <div
        className="relative mt-3 h-2.5 overflow-hidden rounded border border-border bg-muted"
        role="meter"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuetext={`${v.toFixed(2)}, ${zone}, with the yes threshold at ${yes} and no at ${no}`}
      >
        <div
          className="h-full rounded transition-all duration-base ease-sage"
          style={{ width: `${v * 100}%`, backgroundColor: 'hsl(var(--dataviz-primary))' }}
        />
        <span className="absolute inset-y-0 w-px bg-border" style={{ left: `${no * 100}%` }} />
        <span className="absolute inset-y-0 w-px bg-border" style={{ left: `${yes * 100}%` }} />
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10px] tabular text-muted-foreground">
        <span>0.0 no</span>
        <span>{no} &middot; unsure &middot; {yes}</span>
        <span>yes 1.0</span>
      </div>

      {showGuide && (
        <Caption>
          A Noul has no confidence field. From the docs:{' '}
          <em>
            &ldquo;A Noul&rsquo;s probability distribution has only two outcomes, yes and no, so the
            single noul value describes it completely.&rdquo;
          </em>{' '}
          Threshold it in your code — the docs&rsquo; example uses YES = 0.8 and NO = 0.2, and sends
          the middle to a person.
        </Caption>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function AnswerView({
  answer,
  showGuide,
  noulThresholds,
}: {
  answer: Answer
  showGuide: boolean
  noulThresholds?: { yes: number; no: number }
}) {
  if (answer.type === 'choice') return <ChoiceBars answer={answer} showGuide={showGuide} />
  if (answer.type === 'score') return <ScoreLadder answer={answer} showGuide={showGuide} />
  return (
    <NoulTrack
      answer={answer}
      showGuide={showGuide}
      yes={noulThresholds?.yes}
      no={noulThresholds?.no}
    />
  )
}
