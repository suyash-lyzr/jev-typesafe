'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { InlineBanner } from '@/components/ui/inline-banner'
import { AnswerView, ConfidenceChip } from '@/components/playground/answer-views'
import { getPreset, getVariant } from '@/content/presets'
import type { PresetVariant, Preset } from '@/content/presets'
import { LIMITS, type LimitSpec, type Verdict } from '@/content/limits'
import { runOnce } from '@/lib/run-once'
import { errorCardCopy } from '@/lib/errors'
import { formatUsd } from '@/lib/pricing'
import { loadLimitStatuses, saveLimitStatus, type LimitStatus } from '@/lib/storage'
import { DEFAULT_MODEL, type Answer, type RunError } from '@/lib/schema'
import { SITE } from '@/lib/site'

/**
 * The runnable half of /limits. Nothing runs on page open: every card waits
 * for its own button, because each run spends Lyzr's budget.
 */

const VERDICT_STYLE: Record<Verdict['outcome'], { variant: 'danger' | 'success' | 'default' | 'warning'; label: string }> = {
  failed: { variant: 'danger', label: 'still fails' },
  held: { variant: 'default', label: 'held this time' },
  works: { variant: 'success', label: 'works' },
  'did-not-work': { variant: 'warning', label: 'did not work this time' },
  'no-answer': { variant: 'default', label: 'no answer' },
}

/**
 * Every check reads specific answers. With one missing, its arithmetic turns
 * into NaN and a NaN comparison reads as "held" — so a missing answer is its
 * own verdict, and it is never saved as a result.
 */
function verdictFor(
  check: ((answers: Record<string, Answer>) => Verdict) | undefined,
  answers: Record<string, Answer> | null,
  questionIds: string[]
): Verdict | null {
  if (!answers || !check) return null
  const missing = questionIds.filter((id) => !Object.hasOwn(answers, id))
  if (missing.length) {
    return { outcome: 'no-answer', detail: `No answer came back for ${missing.join(', ')}, so this run tested nothing. Run it again.` }
  }
  return check(answers)
}

function questionsOf(preset: Preset, variant: PresetVariant) {
  return variant.questions ?? preset.questions
}

function stateLine(state: unknown): string {
  return typeof state === 'string' ? state : JSON.stringify(state)
}

function RunCard({ spec, preset, variant }: { spec: LimitSpec; preset: Preset; variant: PresetVariant }) {
  const questions = questionsOf(preset, variant)
  const check = spec.check[variant.id]
  const isFix = variant.id === 'works'
  const statusKey = `${preset.slug}:${variant.id}`

  const [answers, setAnswers] = React.useState<Record<string, Answer> | null>(null)
  const [meta, setMeta] = React.useState<{ model: string; ms: number; cost: number } | null>(null)
  const [error, setError] = React.useState<RunError | null>(null)
  const [running, setRunning] = React.useState(false)
  const [saved, setSaved] = React.useState<LimitStatus | null>(null)

  React.useEffect(() => {
    setSaved(loadLimitStatuses()[statusKey] ?? null)
  }, [statusKey])

  async function run() {
    setRunning(true)
    setError(null)
    const out = await runOnce(
      { state: variant.state, model: DEFAULT_MODEL, questions },
      { feature: 'limits', presetId: preset.slug, variantId: variant.id }
    )
    setRunning(false)
    if (!out.ok) {
      setError(out.error)
      return
    }
    setAnswers(out.result.answers)
    setMeta({ model: out.result.model, ms: out.result.timing.jevMs, cost: out.result.costUsd })
    const v = verdictFor(check, out.result.answers, Object.keys(questions))
    if (v && v.outcome !== 'no-answer') {
      const status: LimitStatus = {
        status: v.outcome === 'failed' || v.outcome === 'did-not-work' ? 'fails' : 'passes',
        model: out.result.model,
        ts: Date.now(),
      }
      saveLimitStatus(statusKey, status)
      setSaved(status)
    }
  }

  const verdict = verdictFor(check, answers, Object.keys(questions))
  const recorded = !answers ? variant.recorded : null
  const shown = answers ?? recorded?.answers ?? null
  const many = Object.keys(questions).length > 4

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="outline">{isFix ? 'The rewrite' : 'The way that breaks'}</Chip>
        <h3 className="text-[15px] font-semibold">{variant.label}</h3>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{variant.description}</p>

      <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground" title={stateLine(variant.state)}>
        state {stateLine(variant.state)}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {Object.keys(questions).length} question{Object.keys(questions).length === 1 ? '' : 's'} ·{' '}
        {[...new Set(Object.values(questions).map((q) => q.type))].join(' + ')}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} disabled={running}>
          {running ? 'Running…' : answers ? 'Run again' : 'Run it live'}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/play?p=${preset.slug}&v=${variant.id}`}>Open in the playground</Link>
        </Button>
      </div>

      {error && (
        <InlineBanner variant="warning" className="mt-3">
          {errorCardCopy(error).body}
        </InlineBanner>
      )}

      {verdict && (
        <div className="mt-4 rounded-md border border-border bg-muted/40 p-3" role="status">
          <div className="flex items-center gap-2">
            <Chip variant={VERDICT_STYLE[verdict.outcome].variant}>{VERDICT_STYLE[verdict.outcome].label}</Chip>
            {meta && (
              <span className="font-mono text-[11px] tabular text-muted-foreground">
                {meta.model} · {meta.ms} ms · {formatUsd(meta.cost)}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm">{verdict.detail}</p>
        </div>
      )}

      {!answers && saved && (
        <p className="mt-3 text-xs text-muted-foreground">
          Your last run here, on {saved.model}: {saved.status === 'fails' ? 'the failure showed up' : 'it held'} (
          {new Date(saved.ts).toLocaleDateString()}).
        </p>
      )}

      {shown && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {recorded && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Recorded, not live</span> — {recorded.source} (
              {recorded.model}, {recorded.date}). {recorded.note}
            </p>
          )}
          {Object.entries(shown)
            .slice(0, many ? 0 : undefined)
            .map(([id, answer]) => (
              <div key={id}>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[11px] text-muted-foreground">{id}</p>
                  {answer.type !== 'noul' && <ConfidenceChip confidence={answer.confidence} />}
                </div>
                <div className="mt-1.5">
                  <AnswerView answer={answer} showGuide={false} />
                </div>
              </div>
            ))}
          {many && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] tabular">
              {Object.entries(shown).map(([id, answer]) => (
                <li key={id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{id}</span>
                  <span>
                    {answer.type === 'noul'
                      ? answer.noul.toFixed(2)
                      : answer.type === 'choice'
                        ? `${answer.choice} · ${answer.confidence.toFixed(2)}`
                        : answer.score.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!variant.recorded && !answers && (
        <p className="mt-4 text-xs text-muted-foreground">
          No recorded answer for this one. Run it to see what the model does today.
        </p>
      )}
    </div>
  )
}

export function LimitSection({ spec }: { spec: LimitSpec }) {
  const preset = getPreset(spec.preset)
  if (!preset) return null

  const variants = preset.variants.filter((v) => Object.hasOwn(spec.check, v.id))
  const issuesUrl = SITE.links.issues

  return (
    <section id={spec.anchor} className="scroll-mt-24 border-t border-border pt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {spec.mode ? `Failure mode ${spec.mode} of 9` : 'From the Score page'}
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{spec.heading}</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {spec.docs}{' '}
        <a className="text-brand hover:underline" href={`https://${spec.source}`} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {variants.map((v) => (
          <RunCard key={v.id} spec={spec} preset={preset} variant={getVariant(preset, v.id)} />
        ))}
      </div>

      <p className="mt-4 text-sm">
        <span className="font-medium">Do this instead:</span>{' '}
        <span className="text-muted-foreground">{spec.advice}</span>
      </p>
      {issuesUrl && (
        <p className="mt-2 text-xs text-muted-foreground">
          Still fails, or no longer does, on a newer model?{' '}
          <a
            className="text-brand hover:underline"
            href={`${issuesUrl}/new?title=${encodeURIComponent(`Limits drift: ${spec.heading}`)}&body=${encodeURIComponent(`Section: ${spec.anchor}\nModel: (from the run strip)\nWhat happened:`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Report drift ↗
          </a>
        </p>
      )}
    </section>
  )
}

export function AllLimits() {
  return (
    <div className="mt-10 space-y-14">
      {LIMITS.map((spec) => (
        <LimitSection key={spec.anchor} spec={spec} />
      ))}
    </div>
  )
}
