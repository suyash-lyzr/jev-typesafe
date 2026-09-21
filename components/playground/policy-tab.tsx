'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { CopyAction } from './copy-action'
import { usePlayground } from '@/lib/store'
import { POLICY_PRESETS, evaluatePolicy, type Rule } from '@/lib/policy'
import { generateCode } from '@/lib/codegen'

/**
 * Policy: the tab that proves the point of the whole site.
 *
 * Nothing here calls the model. Every slider re-decides the cached answers, so
 * a reader can watch a threshold change the outcome without spending anything
 * — which is exactly how it works in their own code.
 */

/**
 * Sage ships no slider, so this is the one control built from Radix directly.
 * Radix names the focusable thumb (role="slider") from the Thumb's own props,
 * so the label and value text go there, not on the Root.
 */
function ThresholdSlider({
  value,
  onChange,
  label,
  describe,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  describe: (v: number) => string
}) {
  return (
    <div className="flex items-center gap-2">
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={1}
        step={0.05}
        className="relative flex h-5 w-28 touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={label}
          aria-valuetext={describe(value)}
          className="block h-4 w-4 rounded-full border border-border bg-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </SliderPrimitive.Root>
      <input
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={`${label}, exact value`}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.min(1, Math.max(0, v)))
        }}
        className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-right font-mono text-xs tabular"
      />
    </div>
  )
}

function RuleRow({ rule, index }: { rule: Rule; index: number }) {
  const { updateRule } = usePlayground()
  const set = (patch: Partial<Rule>) => updateRule(index, patch)
  const row = 'flex flex-wrap items-center gap-4 py-2'
  const name = <span className="w-44 shrink-0 truncate font-mono text-xs" title={rule.q}>{rule.q}</span>
  const field = 'flex items-center gap-2 text-xs text-muted-foreground'

  if (rule.kind === 'band') {
    return (
      <div className={row}>
        {name}
        <label className={field}>
          act ≥
          <ThresholdSlider
            value={rule.act}
            label={`Act on ${rule.q} at confidence`}
            describe={(v) => `act at or above ${v.toFixed(2)}`}
            onChange={(act) => set({ act } as Partial<Rule>)}
          />
        </label>
        <label className={field}>
          review ≥
          <ThresholdSlider
            value={rule.review}
            label={`Review ${rule.q} at confidence`}
            describe={(v) => `review at or above ${v.toFixed(2)}; below it goes to a person`}
            onChange={(review) => set({ review } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  if (rule.kind === 'noul') {
    return (
      <div className={row}>
        {name}
        <label className={field}>
          yes ≥
          <ThresholdSlider
            value={rule.yes}
            label={`Treat ${rule.q} as yes from`}
            describe={(v) => `yes at or above ${v.toFixed(2)}`}
            onChange={(yes) => set({ yes } as Partial<Rule>)}
          />
        </label>
        <label className={field}>
          no &lt;
          <ThresholdSlider
            value={rule.no}
            label={`Treat ${rule.q} as no below`}
            describe={(v) => `no below ${v.toFixed(2)}`}
            onChange={(no) => set({ no } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  if (rule.kind === 'copy_if_p_gt') {
    return (
      <div className={row}>
        {name}
        <label className={field}>
          also notify a runner-up above
          <ThresholdSlider
            value={rule.threshold}
            label={`Notify a runner-up for ${rule.q} above`}
            describe={(v) => `notify any other option above ${v.toFixed(2)}`}
            onChange={(threshold) => set({ threshold } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  if (rule.kind === 'flag_if_score_gte') {
    return (
      <div className={row}>
        {name}
        <span className="text-xs text-muted-foreground">
          {rule.label} when the score is at least{' '}
          <span className="font-mono tabular text-foreground">{rule.threshold}</span>
        </span>
      </div>
    )
  }

  return (
    <div className={cn(row, 'text-xs text-muted-foreground')}>
      {name}
      read only when {rule.dependsOn} is {rule.equals.join(' or ')}
    </div>
  )
}

export function PolicyTab() {
  const { policy, applyPreset, lastRun, questions, wireRequest } = usePlayground()
  const [moved, setMoved] = React.useState(false)

  if (!lastRun) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Run once, then move these thresholds to see the same answers decided differently.
      </div>
    )
  }

  const outcome = evaluatePolicy(policy, lastRun.answers, questions)

  return (
    <div className="p-4" onPointerDown={() => setMoved(true)} onKeyDown={() => setMoved(true)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Policy runs in your code. Moving a slider re-evaluates the cached answers; it never calls
          the model.
        </p>
        <Chip variant="default" aria-live="polite">
          0 API calls{moved ? ' · still' : ''}
        </Chip>
      </div>

      {policy.rules.length > 0 ? (
        <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          {policy.rules.map((rule, index) => (
            <RuleRow key={`${index}-${rule.q}-${rule.kind}`} rule={rule} index={index} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No rules yet — add a question and one appears.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(POLICY_PRESETS) as Array<keyof typeof POLICY_PRESETS>).map((key) => {
          const preset = POLICY_PRESETS[key]
          return (
            <Button key={key} variant="outline" size="sm" title={`${preset.note} (${preset.source})`} onClick={() => applyPreset(key)}>
              {preset.label}
            </Button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Presets change thresholds only. Noul rules stay Noul rules, and copy and speculative rules
        are kept.
      </p>

      <section className="mt-5 rounded-lg border border-border bg-card p-4">
        <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Decision</h3>
        <ul className="mt-2 space-y-1" aria-live="polite">
          {outcome.lines.map((line, i) => (
            <li key={i} className="text-sm">
              {line}
            </li>
          ))}
          {outcome.lines.length === 0 && <li className="text-sm text-muted-foreground">No rules apply to these answers.</li>}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <CopyAction label="Copy as Python" content={() => generateCode('python', wireRequest(), policy)} />
          <CopyAction label="Copy as TypeScript" content={() => generateCode('typescript', wireRequest(), policy)} />
          <span className="ml-auto text-xs text-muted-foreground">
            Hard rules — amounts, dates, counts — belong in code too.
          </span>
        </div>
      </section>
    </div>
  )
}

export function JsonTab() {
  const { wireRequest, lastRun, isDirtySinceRun } = usePlayground()
  // Show the request that produced the response beside it; after an edit the
  // current request no longer matches, so both are available.
  const sent = lastRun ? JSON.stringify(lastRun.request, null, 2) : null
  const current = JSON.stringify(wireRequest(), null, 2)
  const response = lastRun
    ? JSON.stringify({ model: lastRun.model, answers: lastRun.answers, usage: lastRun.usage }, null, 2)
    : '// run to see the response'
  const dirty = isDirtySinceRun()

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {sent ? (lastRun?.replay ? 'Request (recorded)' : 'Request (sent)') : 'Request'}
          </h3>
          <CopyAction label="Copy request" size="sm" variant="ghost" content={sent ?? current} />
        </div>
        <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {sent ?? current}
        </pre>
        {sent && dirty && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              The editor has changed since this run — show the current request
            </summary>
            <pre className="mt-2 max-h-[400px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
              {current}
            </pre>
          </details>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {lastRun?.replay ? 'Response (recorded)' : 'Response'}
          </h3>
          <CopyAction label="Copy response" size="sm" variant="ghost" content={response} />
        </div>
        <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {response}
        </pre>
      </div>
    </div>
  )
}

export function CodeTab() {
  const { wireRequest, policy } = usePlayground()
  const [lang, setLang] = React.useState<'curl' | 'python' | 'typescript'>('python')
  const code = generateCode(lang, wireRequest(), policy)

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Language">
        {(['curl', 'python', 'typescript'] as const).map((l) => (
          <button
            key={l}
            role="tab"
            aria-selected={lang === l}
            onClick={() => setLang(l)}
            className={cn(
              'border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-fast',
              lang === l ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {l === 'curl' ? 'cURL' : l === 'python' ? 'Python' : 'TypeScript'}
          </button>
        ))}
        <span className="ml-auto">
          <CopyAction label="Copy code" content={code} />
        </span>
      </div>

      <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
        {code}
      </pre>

      <p className="mt-2 text-xs text-muted-foreground">
        Get a key at console.typesafe.ai. Jev Lab is not affiliated with TypeSafe AI and does not
        resell access.
      </p>
    </div>
  )
}
