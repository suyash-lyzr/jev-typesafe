'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Chip } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { InlineBanner } from '@/components/ui/inline-banner'
import { AnswerView, BandChip, ConfidenceChip, NoulChip } from './answer-views'
import { usePlayground, groupAnswers, type ResultTab, type LastRun } from '@/lib/store'
import { evaluatePolicy, type Band, type NoulVerdict } from '@/lib/policy'
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

function linkFor(source: string): string | null {
  if (/^https?:\/\//.test(source)) return source
  if (/^docs\.typesafe\.ai\//.test(source)) return `https://${source}`
  return null
}

/**
 * Where a replayed answer came from, stated on the page rather than hidden in
 * a tooltip — including the note, which is often the part that matters
 * ("these numbers belong to the docs' ticket, not ours").
 */
export function ProvenanceNote({ run }: { run: LastRun }) {
  if (!run.replay || !run.provenance) return null
  const p = run.provenance
  const href = linkFor(p.source)

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Recorded, not live.</span>{' '}
        {p.source.startsWith('Jev Lab') ? 'Recorded by' : 'Quoted from'}{' '}
        {href ? (
          <a className="text-brand hover:underline" href={href} target="_blank" rel="noreferrer">
            {p.source}
          </a>
        ) : (
          p.source
        )}{' '}
        (<span className="font-mono">{p.model}</span>, {p.date}). Press Run to ask the model now — a
        live answer can differ.
      </p>
      {p.note && <p className="mt-1">{p.note}</p>}
    </div>
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

  // A replay was never timed and cost this site nothing: show neither.
  if (lastRun.replay || !lastRun.timing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
        <Chip variant="warning">replay</Chip>
        <span className="text-foreground">{lastRun.model}</span>
        {lastRun.provenance && <span>recorded {lastRun.provenance.date}</span>}
        {lastRun.usage && lastRun.usage.input_tokens > 0 && (
          <span className="tabular">
            {lastRun.usage.input_tokens} in / {lastRun.usage.output_tokens} out (as recorded)
          </span>
        )}
        {dirty && <Chip variant="default">request changed since recording</Chip>}
      </div>
    )
  }

  const clientOverhead =
    lastRun.clientMs != null ? Math.max(0, lastRun.clientMs - lastRun.timing.serverMs) : null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
      <span className="text-foreground">{lastRun.model}</span>
      <span aria-hidden>·</span>
      {/* Split deliberately: TypeSafe publishes no timing header, so neither
          number may be presented as the model's own compute time. */}
      <span className="tabular">API {lastRun.timing.jevMs} ms</span>
      {clientOverhead != null && <span className="tabular">+{clientOverhead} ms to you</span>}
      {lastRun.usage && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular">
            {lastRun.usage.input_tokens} in / {lastRun.usage.output_tokens} out
          </span>
        </>
      )}
      {lastRun.costUsd != null && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular" title={`≈ ${perMillionRequests(lastRun.costUsd)} per million requests like this one`}>
            {formatUsd(lastRun.costUsd)}
          </span>
        </>
      )}
      {lastRun.timing.retries > 0 && <Chip variant="outline">{lastRun.timing.retries} retry</Chip>}
      {dirty && <Chip variant="default">request changed since run</Chip>}
    </div>
  )
}

function VariantColumn({
  label,
  answer,
  showGuide,
  noulThresholds,
}: {
  label: string
  answer?: Answer
  showGuide: boolean
  noulThresholds?: { yes: number; no: number }
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-medium">{label}</p>
        {answer && answer.type !== 'noul' && <ConfidenceChip confidence={answer.confidence} />}
      </div>
      {answer ? (
        <AnswerView answer={answer} showGuide={showGuide} noulThresholds={noulThresholds} />
      ) : (
        <p className="text-xs text-muted-foreground">No answer came back for this variant.</p>
      )}
    </div>
  )
}

function ResultCard({
  id,
  a,
  b,
  paired,
  question,
  band,
  noulVerdict,
  greyed,
  showGuide,
  noulThresholds,
  selected,
  onSelect,
}: {
  id: string
  a?: Answer
  b?: Answer
  paired: boolean
  question?: Question
  band?: Band
  noulVerdict?: NoulVerdict
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

  const first = a ?? b
  if (!first) return null

  return (
    <article
      aria-label={`${id} answer`}
      className={cn(
        'rounded-lg border bg-card p-4 text-left transition-opacity duration-base',
        selected ? 'border-brand' : 'border-border',
        greyed && 'opacity-50'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">{id}</span>
        <Chip variant="outline">{first.type.toUpperCase()}</Chip>
        {!paired && first.type !== 'noul' && <ConfidenceChip confidence={first.confidence} />}
        {band && <BandChip band={band} />}
        {noulVerdict && <NoulChip verdict={noulVerdict} />}
        {paired && <Chip variant="default">A/B · policy follows A</Chip>}
        {greyed && <Chip variant="outline">not on this path</Chip>}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="ml-auto rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {selected ? 'Unhighlight question' : 'Show question'}
        </button>
      </div>

      {instructions && (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={instructions}>
          {instructions}
        </p>
      )}

      <div className="mt-3">
        {paired ? (
          <div className="grid gap-4 md:grid-cols-2">
            <VariantColumn label="Variant A" answer={a} showGuide={showGuide} noulThresholds={noulThresholds} />
            <VariantColumn label="Variant B" answer={b} showGuide={showGuide} noulThresholds={noulThresholds} />
          </div>
        ) : (
          <AnswerView answer={first} showGuide={showGuide} noulThresholds={noulThresholds} />
        )}
      </div>

      {paired && a && b && showGuide && (
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          Both variants travelled in one request and were evaluated in parallel, so the second cost
          only its own question tokens.
          {a.type !== b.type && (
            <>
              {' '}
              They are different question types, so the numbers are not comparable: the docs record
              a Noul at 0.22 and a yes/no Choice at 0.01 for the same ticket. Never carry a
              threshold from one to the other.
            </>
          )}
        </p>
      )}
    </article>
  )
}

export function AnswersTab() {
  const { lastRun, questions, policy, selectedQuestion, selectQuestion, running, notice, dismissNotice } =
    usePlayground()
  const [showGuide, setShowGuide] = React.useState(true)

  if (running) {
    const count = Object.keys(questions).length || 3
    return (
      <div className="space-y-3 p-4" aria-busy="true">
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

  const noticeBanner = notice ? (
    <InlineBanner variant="info" className="mb-3" onDismiss={dismissNotice}>
      {notice}
    </InlineBanner>
  ) : null

  if (!lastRun) {
    return (
      <div className="p-4">
        {noticeBanner}
        <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
          <h3 className="text-xl font-semibold">Run to see answers</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Jev evaluates every question against the state in parallel and hands back typed values
            your code can branch on. Nothing runs until you press Run.
          </p>
        </div>
      </div>
    )
  }

  const outcome = evaluatePolicy(policy, lastRun.answers, questions)
  const groups = groupAnswers(lastRun.answers)
  const missing = Object.keys(questions).filter((id) => !groups.some((g) => g.id === id))

  return (
    <div className="p-4">
      {noticeBanner}
      <ProvenanceNote run={lastRun} />

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
        {groups.map(({ id, a, b, paired }) => {
          const noulRule = policy.rules.find((r) => r.q === id && r.kind === 'noul')
          return (
            <ResultCard
              key={id}
              id={id}
              a={a}
              b={b}
              paired={paired}
              question={Object.hasOwn(questions, id) ? questions[id] : undefined}
              band={outcome.bands[id]}
              noulVerdict={outcome.nouls[id]}
              greyed={outcome.greyed.includes(id)}
              showGuide={showGuide}
              noulThresholds={
                noulRule && noulRule.kind === 'noul' ? { yes: noulRule.yes, no: noulRule.no } : undefined
              }
              selected={selectedQuestion === id}
              onSelect={() => selectQuestion(selectedQuestion === id ? null : id)}
            />
          )
        })}
      </div>

      {missing.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {lastRun.replay
            ? `The recording has no answer for ${missing.join(', ')} — the source did not publish one. Run it to ask the model.`
            : `No answer yet for ${missing.join(', ')}: added after this run. Run again to include it.`}
        </p>
      )}

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
    <div className="p-4" role="alert">
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
  const tabs = TABS.filter((t) => t.id !== 'compare' || showCompare)
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  // If the visible tab disappears (compare switched off), fall back to Answers.
  React.useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab('answers')
  }, [tabs, tab, setTab])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = tabs.findIndex((t) => t.id === tab)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setTab(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }

  return (
    <div className="flex h-full flex-col">
      <RunStrip />
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2" role="tablist" aria-label="Result views" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            id={`result-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="result-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors duration-fast',
              tab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id="result-panel"
        role="tabpanel"
        aria-labelledby={`result-tab-${tab}`}
        className="flex-1 overflow-y-auto"
      >
        {children}
      </div>
    </div>
  )
}
