'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { CopyButton } from '@/components/ui/copy-button'
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

/** Sage ships no slider, so this is the one component built from Radix directly. */
function ThresholdSlider({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={1}
        step={0.05}
        aria-label={label}
        aria-valuetext={`${label} at or above ${value.toFixed(2)}`}
        className="relative flex h-5 w-28 touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-border bg-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
      </SliderPrimitive.Root>
      <input
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={`${label} value`}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.min(1, Math.max(0, v)))
        }}
        className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-right font-mono text-xs tabular"
      />
    </div>
  )
}

function RuleRow({ rule }: { rule: Rule }) {
  const { updateRule } = usePlayground()

  if (rule.kind === 'band') {
    return (
      <div className="flex flex-wrap items-center gap-4 py-2">
        <span className="w-44 shrink-0 font-mono text-xs">{rule.q}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          act ≥
          <ThresholdSlider
            value={rule.act}
            label={`act on ${rule.q}`}
            onChange={(act) => updateRule(rule.q, { act } as Partial<Rule>)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          review ≥
          <ThresholdSlider
            value={rule.review}
            label={`review ${rule.q}`}
            onChange={(review) => updateRule(rule.q, { review } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  if (rule.kind === 'noul') {
    return (
      <div className="flex flex-wrap items-center gap-4 py-2">
        <span className="w-44 shrink-0 font-mono text-xs">{rule.q}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          yes ≥
          <ThresholdSlider
            value={rule.yes}
            label={`yes for ${rule.q}`}
            onChange={(yes) => updateRule(rule.q, { yes } as Partial<Rule>)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          no ≤
          <ThresholdSlider
            value={rule.no}
            label={`no for ${rule.q}`}
            onChange={(no) => updateRule(rule.q, { no } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  if (rule.kind === 'copy_if_p_gt') {
    return (
      <div className="flex flex-wrap items-center gap-4 py-2">
        <span className="w-44 shrink-0 font-mono text-xs">{rule.q}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          also notify a runner-up above
          <ThresholdSlider
            value={rule.threshold}
            label={`copy threshold for ${rule.q}`}
            onChange={(threshold) => updateRule(rule.q, { threshold } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  if (rule.kind === 'flag_if_score_gte') {
    return (
      <div className="flex flex-wrap items-center gap-4 py-2">
        <span className="w-44 shrink-0 font-mono text-xs">{rule.q}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {rule.label} when score ≥
          <ThresholdSlider
            value={rule.threshold}
            label={`${rule.label} threshold for ${rule.q}`}
            onChange={(threshold) => updateRule(rule.q, { threshold } as Partial<Rule>)}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 py-2 text-xs text-muted-foreground">
      <span className="w-44 shrink-0 font-mono">{rule.q}</span>
      read only when {rule.dependsOn} is {rule.equals.join(' or ')}
    </div>
  )
}

export function PolicyTab() {
  const { policy, setPolicy, lastRun, questions, wireRequest } = usePlayground()
  const [pulsed, setPulsed] = React.useState(false)

  if (!lastRun) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Run once, then move these thresholds to see the same answers decided differently.
      </div>
    )
  }

  const outcome = evaluatePolicy(policy, lastRun.answers, questions)
  const questionIds = Object.keys(questions)

  return (
    <div className="p-4" onPointerDown={() => setPulsed(true)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Policy runs in your code. Moving a slider re-evaluates the cached answers; it never calls
          the model.
        </p>
        <Chip variant={pulsed ? 'brand' : 'default'}>0 API calls</Chip>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
        {policy.rules.map((rule) => (
          <RuleRow key={`${rule.q}-${rule.kind}`} rule={rule} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(POLICY_PRESETS).map(([key, preset]) => (
          <Button
            key={key}
            variant="outline"
            size="sm"
            title={preset.note}
            onClick={() => setPolicy({ rules: preset.make(questionIds) })}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <section className="mt-5 rounded-lg border border-border bg-card p-4">
        <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          Decision
        </h3>
        <ul className="mt-2 space-y-1">
          {outcome.lines.map((line, i) => (
            <li key={i} className="text-sm transition-opacity duration-fast">
              {line}
            </li>
          ))}
          {outcome.lines.length === 0 && (
            <li className="text-sm text-muted-foreground">No rules yet.</li>
          )}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <CopyButton content={generateCode('python', wireRequest(), policy)} />
          <span className="text-xs text-muted-foreground">Copy as Python</span>
          <CopyButton content={generateCode('typescript', wireRequest(), policy)} />
          <span className="text-xs text-muted-foreground">Copy as TypeScript</span>
          <span className="ml-auto text-xs text-muted-foreground">
            Hard rules — amounts, dates, counts — belong in code too.
          </span>
        </div>
      </section>
    </div>
  )
}

export function JsonTab() {
  const { wireRequest, lastRun } = usePlayground()
  const request = JSON.stringify(wireRequest(), null, 2)
  const response = lastRun
    ? JSON.stringify(
        { model: lastRun.model, answers: lastRun.answers, usage: lastRun.usage },
        null,
        2
      )
    : '// run to see the response'

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            Request
          </h3>
          <CopyButton content={request} />
        </div>
        <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {request}
        </pre>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            Response
          </h3>
          <CopyButton content={response} />
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
      <div className="mb-2 flex items-center gap-1">
        {(['curl', 'python', 'typescript'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={cn(
              'border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-fast',
              lang === l
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {l === 'curl' ? 'cURL' : l === 'python' ? 'Python' : 'TypeScript'}
          </button>
        ))}
        <span className="ml-auto">
          <CopyButton content={code} />
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
