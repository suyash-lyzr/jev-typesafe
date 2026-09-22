'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { InlineBanner } from '@/components/ui/inline-banner'
import { ChevronDown } from 'lucide-react'
import { DecidingLoader } from './answer-row'
import { StepLabel } from './type-badge'
import { LlmPicker, QuotaDots, useCompareSetup } from './llm-picker'
import { DecisionCard, PolicyCard, derivedDecision } from './decision-cards'
import { getPreset, getVariant } from '@/content/presets'
import { usePlayground, groupAnswers, type ResultTab, type LastRun } from '@/lib/store'
import { evaluatePolicy } from '@/lib/policy'
import { errorCardCopy } from '@/lib/errors'
import { formatUsd, perMillionRequests } from '@/lib/pricing'

/** Compare lives with the results it adds to: the next run also goes to an LLM. */
function CompareToggle() {
  const { compareOn, setCompareOn, compareQuota } = usePlayground()
  useCompareSetup()
  const out = compareQuota?.remaining === 0
  // Nothing left today: the switch cannot stay on, or Run would be refused.
  React.useEffect(() => {
    if (out && compareOn) setCompareOn(false)
  }, [out, compareOn, setCompareOn])

  return (
    <div
      className={cn(
        'ml-auto inline-flex h-10 shrink-0 items-center rounded-full border bg-card pl-1.5 pr-3 text-[13px] shadow-card transition-colors duration-fast',
        out && 'opacity-60'
      )}
    >
      <label
        className={cn('inline-flex items-center gap-2 pr-1', out ? 'cursor-not-allowed' : 'cursor-pointer')}
        title={out ? 'No free comparisons left today. They reset at 00:00 UTC.' : 'Send the next run to Jev and an OpenAI model together'}
      >
        <Switch checked={compareOn} onCheckedChange={setCompareOn} disabled={out} aria-label="Compare with an LLM" />
        <span className={compareOn ? 'text-foreground' : 'text-muted-foreground'}>{compareOn ? 'Compare' : 'Compare with an LLM'}</span>
      </label>
      {compareOn && (
        <>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <LlmPicker bare />
        </>
      )}
      {compareQuota && (
        <>
          <span className="mx-2 h-4 w-px bg-border" aria-hidden />
          <QuotaDots />
        </>
      )}
    </div>
  )
}

/**
 * The right-hand pane: what came back, and what your code would do about it.
 */

const TABS: Array<{ id: ResultTab; label: string }> = [
  { id: 'answers', label: 'Decisions' },
  { id: 'policy', label: 'Policy' },
  { id: 'compare', label: 'Compare' },
  { id: 'json', label: 'JSON' },
  { id: 'code', label: 'Code' },
]

function linkFor(source: string): string | null {
  if (/^https?:\/\//.test(source)) return source
  if (/^docs\.typesafe\.ai\//.test(source)) return `https://${source}`
  return null
}

/**
 * Where a replayed answer came from: one line on the page, the note one click
 * away. Short, but never hidden — a replay must never pass for a live run.
 */
export function ProvenanceNote({ run }: { run: LastRun }) {
  if (!run.replay || !run.provenance) return null
  const p = run.provenance
  const href = linkFor(p.source)
  const ours = p.source.startsWith('Jev Lab')

  return (
    <details className="group mb-3 rounded-xl border border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[11px] text-brand-text">replay</span>
        <span className="min-w-0 truncate">
          {ours ? 'Recorded by Jev Lab' : 'Quoted from '}
          {!ours &&
            (href ? (
              <a className="text-brand hover:underline" href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                {p.source}
              </a>
            ) : (
              p.source
            ))}{' '}
          · <span className="font-mono">{p.model}</span> · {p.date}
        </span>
        {p.note && (
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-label="Details" />
        )}
      </summary>
      {p.note && <p className="mt-2 leading-relaxed">{p.note}</p>}
      <p className="mt-2 leading-relaxed">Press Run to ask the model now; a live answer can differ.</p>
    </details>
  )
}

/** The run's facts, as one quiet mono line at the right of the tab bar. */
function RunMeta() {
  const { lastRun, running, isDirtySinceRun } = usePlayground()
  const dirty = isDirtySinceRun()

  if (running) return <DecidingLoader className="text-xs" />
  if (!lastRun) return <span className="text-faint">no run yet</span>

  const changed = dirty && (
    <span className="rounded-full bg-warning-soft px-2 py-0.5 font-sans text-[11px] text-warning-text">edited since run</span>
  )

  // A replay was never timed and cost this site nothing: show neither.
  if (lastRun.replay || !lastRun.timing) {
    return (
      <>
        {changed}
        <span className="truncate">{lastRun.model}</span>
      </>
    )
  }

  const clientOverhead =
    lastRun.clientMs != null ? Math.max(0, lastRun.clientMs - lastRun.timing.serverMs) : null

  return (
    <>
      {changed}
      <span className="truncate text-foreground">{lastRun.model}</span>
      {/* Split deliberately: TypeSafe publishes no timing header, so neither
          number may be presented as the model's own compute time. */}
      <span
        className="tabular"
        title={clientOverhead != null ? `API ${lastRun.timing.jevMs} ms, plus ${clientOverhead} ms between our server and you` : undefined}
      >
        {lastRun.timing.jevMs} ms
      </span>
      {lastRun.usage && <span className="hidden tabular xl:inline">{lastRun.usage.input_tokens} tok</span>}
      {lastRun.costUsd != null && (
        <span className="tabular" title={`≈ ${perMillionRequests(lastRun.costUsd)} per million requests like this one`}>
          {formatUsd(lastRun.costUsd)}
        </span>
      )}
      {lastRun.timing.retries > 0 && <span>{lastRun.timing.retries} retry</span>}
    </>
  )
}

export function AnswersTab() {
  const { lastRun, questions, policy, selectedQuestion, selectQuestion, running, notice, dismissNotice, presetId, variantId } =
    usePlayground()

  if (running) {
    const count = Object.keys(questions).length || 3
    return (
      <div className="space-y-2.5 p-4" aria-busy="true">
        {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
          <div key={i} className="rounded-[14px] border border-border bg-card p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-7 w-32" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-1.5 w-4/5 rounded-full" />
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
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[14px] border border-dashed border-border p-8 text-center">
          <p className="font-display text-base font-semibold">No decisions yet</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
            Press <span className="font-medium text-foreground">Run</span> and every question comes back as a
            typed answer with its probabilities.
          </p>
        </div>
      </div>
    )
  }

  const outcome = evaluatePolicy(policy, lastRun.answers, questions)
  const groups = groupAnswers(lastRun.answers)
  const missing = Object.keys(questions).filter((id) => !groups.some((g) => g.id === id))
  const animateKey = lastRun.hash + String(lastRun.clientMs ?? '')

  // The one decision these answers feed: the use case's own, or a plain reading of the first question.
  const preset = presetId ? getPreset(presetId) : null
  const named = preset ? getVariant(preset, variantId ?? undefined).decision ?? preset.decision : undefined
  const spec = named && Object.hasOwn(questions, named.question) ? named : derivedDecision(questions)
  const specAnswer = spec ? groups.find((g) => g.id === spec.question)?.a : undefined

  return (
    <div className="space-y-2.5 p-4">
      {noticeBanner}
      <ProvenanceNote run={lastRun} />

      {groups.map(({ id, a, b, paired }, index) => {
        const first = a ?? b
        if (!first) return null
        return (
          <DecisionCard
            key={`${animateKey}-${id}`}
            index={index}
            id={id}
            answer={first}
            b={paired && a ? b : undefined}
            question={Object.hasOwn(questions, id) ? questions[id] : undefined}
            greyed={outcome.greyed.includes(id)}
            selected={selectedQuestion === id}
            onSelect={() => selectQuestion(selectedQuestion === id ? null : id)}
            animateKey={animateKey}
          />
        )
      })}

      {spec && <PolicyCard spec={spec} answer={specAnswer} />}

      {missing.length > 0 && (
        <p className="text-xs text-faint">
          {lastRun.replay
            ? `Not in the recording: ${missing.join(', ')}. Run to ask the model.`
            : `Added after this run: ${missing.join(', ')}. Run again to include.`}
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

export function ResultTabs({ children, numbered = true }: { children: React.ReactNode; numbered?: boolean }) {
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
    <div className="flex h-full flex-col bg-results">
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="min-w-0">
          <StepLabel n={numbered ? 4 : undefined}>Read the decisions</StepLabel>
          <p className={cn('mt-1 text-[13px]', numbered && 'pl-7', 'text-muted-foreground')}>Typed answers your code can act on</p>
        </div>
        <CompareToggle />
      </div>
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
      <div className="inline-flex shrink-0 gap-0.5 overflow-x-auto rounded-full bg-muted p-[3px]" role="tablist" aria-label="Result views" onKeyDown={onKeyDown}>
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
              'shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors duration-fast',
              tab === t.id
                ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(222_47%_11%/0.08)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3 font-mono text-xs text-muted-foreground" aria-live="off">
        <RunMeta />
      </div>
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
