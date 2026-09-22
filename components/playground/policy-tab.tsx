'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
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
  // Two grid cells: the slider stretches, the value sits in a fixed column.
  return (
    <>
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={1}
        step={0.05}
        className="relative flex h-5 w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={label}
          aria-valuetext={describe(value)}
          className="block h-4 w-4 rounded-full border-2 border-card bg-primary shadow-[0_0_0_1px_hsl(var(--border))] transition-transform duration-fast hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
        className="h-7 w-full rounded-md border border-transparent bg-muted/70 px-1.5 text-center font-mono text-xs tabular outline-none transition-colors hover:border-input focus:border-input focus:bg-card [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </>
  )
}

/** One rule: a name line, then aligned rows of label · slider · value. */
function RuleBlock({ name, hint, children }: { name: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <div className="flex items-baseline justify-between gap-3 max-sm:flex-col max-sm:gap-0.5">
        <span className="min-w-0 truncate font-mono text-[13px] font-medium text-foreground max-sm:max-w-full" title={name}>
          {name}
        </span>
        <span className="shrink-0 text-[11.5px] text-faint max-sm:shrink">{hint}</span>
      </div>
      {children && <div className="mt-2.5 grid grid-cols-[92px_minmax(0,1fr)_56px] items-center gap-x-3 gap-y-2">{children}</div>}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[12.5px] text-muted-foreground">{children}</span>
}

function RuleRow({ rule, index }: { rule: Rule; index: number }) {
  const { updateRule } = usePlayground()
  const set = (patch: Partial<Rule>) => updateRule(index, patch)

  if (rule.kind === 'band') {
    return (
      <RuleBlock name={rule.q} hint="By confidence · below review, a person decides">
        <Label>Act from</Label>
        <ThresholdSlider
          value={rule.act}
          label={`Act on ${rule.q} at confidence`}
          describe={(v) => `act at or above ${v.toFixed(2)}`}
          onChange={(act) => set({ act } as Partial<Rule>)}
        />
        <Label>Review from</Label>
        <ThresholdSlider
          value={rule.review}
          label={`Review ${rule.q} at confidence`}
          describe={(v) => `review at or above ${v.toFixed(2)}; below it goes to a person`}
          onChange={(review) => set({ review } as Partial<Rule>)}
        />
      </RuleBlock>
    )
  }

  if (rule.kind === 'noul') {
    return (
      <RuleBlock name={rule.q} hint="By probability · in between is unsure">
        <Label>Yes from</Label>
        <ThresholdSlider
          value={rule.yes}
          label={`Treat ${rule.q} as yes from`}
          describe={(v) => `yes at or above ${v.toFixed(2)}`}
          onChange={(yes) => set({ yes } as Partial<Rule>)}
        />
        <Label>No below</Label>
        <ThresholdSlider
          value={rule.no}
          label={`Treat ${rule.q} as no below`}
          describe={(v) => `no below ${v.toFixed(2)}`}
          onChange={(no) => set({ no } as Partial<Rule>)}
        />
      </RuleBlock>
    )
  }

  if (rule.kind === 'copy_if_p_gt') {
    return (
      <RuleBlock name={rule.q} hint="Also notify a runner-up">
        <Label>Above</Label>
        <ThresholdSlider
          value={rule.threshold}
          label={`Notify a runner-up for ${rule.q} above`}
          describe={(v) => `notify any other option above ${v.toFixed(2)}`}
          onChange={(threshold) => set({ threshold } as Partial<Rule>)}
        />
      </RuleBlock>
    )
  }

  if (rule.kind === 'flag_if_score_gte') {
    return <RuleBlock name={rule.q} hint={`${rule.label} when the score is at least ${rule.threshold}`} />
  }

  return <RuleBlock name={rule.q} hint={`Read only when ${rule.dependsOn} is ${rule.equals.join(' or ')}`} />
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
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          Policy runs in your code. Moving a slider re-evaluates the cached answers; it never calls
          the model.
        </p>
        <Chip variant="default" aria-live="polite" className="shrink-0">
          0 API calls{moved ? ' · still' : ''}
        </Chip>
      </div>

      {policy.rules.length > 0 ? (
        <div className="divide-y divide-border rounded-[16px] border border-border bg-card px-5 shadow-card">
          {policy.rules.map((rule, index) => (
            <RuleRow key={`${index}-${rule.q}-${rule.kind}`} rule={rule} index={index} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No rules yet — add a question and one appears.</p>
      )}

      <p className="mt-4 text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Start from a preset</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(POLICY_PRESETS) as Array<keyof typeof POLICY_PRESETS>).map((key) => {
          const preset = POLICY_PRESETS[key]
          return (
            <button
              key={key}
              type="button"
              title={`${preset.note} (${preset.source})`}
              onClick={() => applyPreset(key)}
              className="h-8 rounded-full border border-border bg-card px-3 text-[12.5px] text-muted-foreground transition-colors duration-fast hover:border-faint hover:text-foreground"
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Presets change thresholds only. Noul rules stay Noul rules, and copy and speculative rules
        are kept.
      </p>

      <section className="mt-5 rounded-[16px] border border-border bg-card p-5 shadow-card">
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
    <div className="grid max-md:grid-cols-1 gap-4 p-4 lg:grid-cols-2">
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
