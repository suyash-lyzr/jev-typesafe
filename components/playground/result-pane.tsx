'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Chip } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { InlineBanner } from '@/components/ui/inline-banner'
import { AnswerView, BandChip, ConfidenceChip } from './answer-views'
import { usePlayground, groupAnswers, type ResultTab } from '@/lib/store'
import { evaluatePolicy } from '@/lib/policy'
import { errorCardCopy } from '@/lib/errors'
import { formatUsd, perMillionRequests } from '@/lib/pricing'
import type { Answer, Question } from '@/lib/schema'

/**
 * The right-hand pane: what came back, and what your code would do about it.
 */

const TABS: Array<{ id: ResultTab; label: string }> = [
  { id: 'answers', label: 'Answers' },
  { id: 'policy', label: 'Policy' },
  { id: 'compare', label: 'Compare' },
  { id: 'json', label: 'JSON' },
  { id: 'code', label: 'Code' },
]

/** A live counter while a run is in flight; aria-hidden so it cannot spam a screen reader. */
function RunningMs() {
  const [ms, setMs] = React.useState(0)

  React.useEffect(() => {
    const started = performance.now()
    let frame = 0
    const tick = () => {
      setMs(Math.round(performance.now() - started))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <span className="font-mono tabular" aria-hidden>
      {ms} ms
    </span>
  )
}

export function RunStrip() {
  const { lastRun, running, isDirtySinceRun } = usePlayground()
  const dirty = isDirtySinceRun()

  if (running) {
    return (
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
        <RunningMs />
        <span className="font-sans">Evaluating every question in parallel…</span>
      </div>
    )
  }

  if (!lastRun) {
    return (
      <div className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
        no run yet
      </div>
    )
  }

  const clientOverhead = Math.max(0, lastRun.clientMs - lastRun.timing.serverMs)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
      <span className="text-foreground">{lastRun.model}</span>
      <span>·</span>
      {/* Split deliberately: TypeSafe publishes no timing header, so neither
          number may be presented as the model's own compute time. */}
      <span className="tabular">API {lastRun.timing.jevMs} ms</span>
      <span className="tabular">+{clientOverhead} ms to you</span>
      <span>·</span>
      <span className="tabular">
        {lastRun.usage.input_tokens} in / {lastRun.usage.output_tokens} out
      </span>
      <span>·</span>
      <span className="tabular" title={`≈ ${perMillionRequests(lastRun.costUsd)} per million requests like this one`}>
        {formatUsd(lastRun.costUsd)}
      </span>
      {lastRun.timing.retries > 0 && <Chip variant="outline">{lastRun.timing.retries} retries</Chip>}
      {lastRun.replay && <Chip variant="warning">replay</Chip>}
      {dirty && <Chip variant="default">request changed since run</Chip>}
    </div>
  )
}

function ResultCard({
  id,
  answer,
  variantB,
  question,
  band,
  greyed,
  showGuide,
  noulThresholds,
  selected,
  onSelect,
}: {
  id: string
  answer: Answer
  variantB?: Answer
  question?: Question
  band?: 'act' | 'review' | 'escalate'
  greyed: boolean
  showGuide: boolean
  noulThresholds?: { yes: number; no: number }
  selected: boolean
  onSelect: () => void
}) {
  const instructions =
    typeof question?.instructions === 'string'
      ? question.instructions
      : question?.instructions
        ? JSON.stringify(question.instructions)
        : ''

  const typeLabel = answer.type.toUpperCase()

  return (
    <div
      onClick={onSelect}
      className={cn(
        'rounded-lg border bg-card p-4 transition-opacity duration-base',
        selected ? 'border-brand' : 'border-border',
        greyed && 'opacity-50'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">{id}</span>
        <Chip variant="outline">{typeLabel}</Chip>
        {answer.type !== 'noul' && <ConfidenceChip confidence={answer.confidence} />}
        {band && <BandChip band={band} />}
        {greyed && <Chip variant="outline">not on this path</Chip>}
      </div>

      {instructions && (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={instructions}>
          {instructions}
        </p>
      )}

      <div className="mt-3">
        {variantB ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium">Variant A</p>
              <AnswerView answer={answer} showGuide={showGuide} noulThresholds={noulThresholds} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium">Variant B</p>
              <AnswerView answer={variantB} showGuide={showGuide} noulThresholds={noulThresholds} />
            </div>
          </div>
        ) : (
          <AnswerView answer={answer} showGuide={showGuide} noulThresholds={noulThresholds} />
        )}
      </div>

      {variantB && showGuide && (
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          Both variants travelled in one request and were evaluated in parallel, so the second cost
          only its own question tokens.
          {answer.type !== variantB.type && (
            <>
              {' '}
              They are different question types, so the numbers are not comparable: the docs record
              a Noul at 0.22 and a yes/no Choice at 0.01 for the same ticket. Never carry a
              threshold from one to the other.
            </>
          )}
        </p>
      )}
    </div>
  )
}

export function AnswersTab() {
  const { lastRun, questions, variants, policy, selectedQuestion, selectQuestion, running } =
    usePlayground()
  const [showGuide, setShowGuide] = React.useState(true)

  if (running) {
    const count = Object.keys(questions).length || 3
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-4/5" />
              <Skeleton className="h-2 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!lastRun) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
        <h3 className="text-xl font-semibold">Run to see answers</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Jev evaluates every question against the state in parallel and hands back typed values
          your code can branch on.
        </p>
      </div>
    )
  }

  const outcome = evaluatePolicy(policy, lastRun.answers, questions)
  const groups = groupAnswers(lastRun.answers)

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {groups.length} answer{groups.length === 1 ? '' : 's'} from one request
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showGuide} onCheckedChange={setShowGuide} aria-label="Reading guide" />
          Reading guide
        </label>
      </div>

      <div className="space-y-3">
        {groups.map(({ id, a, b }) => {
          const noulRule = policy.rules.find((r) => r.q === id && r.kind === 'noul')
          return (
            <ResultCard
              key={id}
              id={id}
              answer={a}
              variantB={b}
              question={questions[id]}
              band={outcome.bands[id]}
              greyed={outcome.greyed.includes(id)}
              showGuide={showGuide}
              noulThresholds={
                noulRule && noulRule.kind === 'noul'
                  ? { yes: noulRule.yes, no: noulRule.no }
                  : undefined
              }
              selected={selectedQuestion === id}
              onSelect={() => selectQuestion(selectedQuestion === id ? null : id)}
            />
          )
        })}
      </div>

      {outcome.greyed.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Greyed by policy: {outcome.greyed.join(', ')} — asked speculatively in the same request,
          and ignored on this path. Asking them cost only their own tokens.
        </p>
      )}
    </div>
  )
}

export function ErrorCard() {
  const { error } = usePlayground()
  if (!error) return null

  const { title, body } = errorCardCopy(error)
  const variant = error.error === 'validation' ? 'danger' : 'warning'

  return (
    <div className="p-4">
      <InlineBanner variant={variant}>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm">{body}</p>
          {error.path && error.path.length > 0 && (
            <p className="mt-1 font-mono text-xs">at {error.path.join('.')}</p>
          )}
        </div>
      </InlineBanner>
    </div>
  )
}

export function ResultTabs({ children }: { children: React.ReactNode }) {
  const { tab, setTab, compareOn, lastRun } = usePlayground()
  const showCompare = compareOn || Boolean(lastRun?.compare)

  return (
    <div className="flex h-full flex-col">
      <RunStrip />
      <div className="flex gap-1 border-b border-border px-2" role="tablist">
        {TABS.filter((t) => t.id !== 'compare' || showCompare).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-[13px] font-medium transition-colors duration-fast',
              tab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

export { Button }
