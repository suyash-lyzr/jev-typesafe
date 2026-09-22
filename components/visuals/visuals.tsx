'use client'

import * as React from 'react'
import { Cpu, Monitor, ShieldCheck, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TypeBadge } from '@/components/playground/type-badge'

/**
 * Small animated pictures that replace paragraphs.
 *
 * Every animation starts when the picture scrolls into view, runs once (or
 * loops gently where the loop is the point), and shows its final frame at once
 * under prefers-reduced-motion. Numbers drawn here are illustrative shapes,
 * labelled as such where a reader could mistake them for a result.
 */

export function useInView<T extends Element>(threshold = 0.35) {
  const ref = React.useRef<T>(null)
  const [seen, setSeen] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return setSeen(true)
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, seen] as const
}

export function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
  }, [])
  return reduced
}

/** A bar that fills to `value` once `on` is true. */
function Fill({ value, on, strong, delay = 0, className }: { value: number; on: boolean; strong?: boolean; delay?: number; className?: string }) {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <span
        className={cn('block h-full rounded-full transition-[width] duration-700 ease-signal', strong ? 'bg-fill' : 'bg-faint/45')}
        style={{ width: on ? `${Math.round(value * 100)}%` : '0%', transitionDelay: `${delay}ms` }}
      />
    </span>
  )
}

// ---------------------------------------------------------------------------
// The three types, each as one picture
// ---------------------------------------------------------------------------

/** Choice: a distribution over your options that always sums to 1. */
export function ChoiceViz({ className }: { className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const rows = [
    ['billing', 0.72],
    ['shipping', 0.2],
    ['other', 0.08],
  ] as const
  return (
    <div ref={ref} className={cn('space-y-2', className)}>
      {rows.map(([k, v], i) => (
        <div key={k}>
          <div className="flex justify-between text-[11.5px]">
            <span className={cn('font-mono', i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{k}</span>
            <span className="num text-muted-foreground">{v.toFixed(2)}</span>
          </div>
          <Fill value={v} on={on} strong={i === 0} delay={i * 120} className="mt-1" />
        </div>
      ))}
      <p className="pt-0.5 text-right font-mono text-[10.5px] text-faint">Σ = 1.00</p>
    </div>
  )
}

/** Score: ordered levels, and a marker at the probability-weighted position. */
export function ScoreViz({ className }: { className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const levels = [0, 0.72, 0.28]
  const expected = 1.28
  return (
    <div ref={ref} className={cn(className)}>
      <div className="flex items-end gap-1.5">
        {levels.map((p, i) => (
          <div key={i} className="flex flex-1 flex-col items-center">
            <span className="flex h-12 w-full items-end overflow-hidden border-b border-border">
              <span
                className={cn('mx-auto block w-3/5 rounded-t-[6px] transition-[height] duration-700 ease-signal', i === 1 ? 'bg-fill' : 'bg-faint/45')}
                style={{ height: on ? `${Math.max(p * 100, 4)}%` : '0%', transitionDelay: `${i * 120}ms` }}
              />
            </span>
            <span className="mt-1 font-mono text-[10.5px] text-muted-foreground">{i}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-2 h-4">
        <span className="absolute top-1/2 h-px bg-border" style={{ left: `${(0.5 / levels.length) * 100}%`, right: `${(0.5 / levels.length) * 100}%` }} aria-hidden />
        <span
          className="absolute top-0 -translate-x-1/2 transition-[left] duration-1000 ease-signal"
          // Level i sits at the centre of column i, so the marker uses the same scale.
          style={{ left: on ? `${((expected + 0.5) / levels.length) * 100}%` : `${(0.5 / levels.length) * 100}%` }}
          aria-hidden
        >
          <span className="block h-4 w-[3px] rounded-full bg-foreground" />
        </span>
      </div>
      <p className="mt-1 text-right font-mono text-[10.5px] text-faint">score = {expected.toFixed(2)}</p>
    </div>
  )
}

/** Noul: one probability on a 0–1 track; 0.5 is "equally likely". No confidence. */
export function NoulViz({ className, value = 0.93 }: { className?: string; value?: number }) {
  const [ref, on] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={cn(className)}>
      <div className="flex justify-between text-[11.5px]">
        <span className="text-muted-foreground">P(yes)</span>
        <span className="num font-medium text-foreground">{value.toFixed(2)}</span>
      </div>
      <div className="relative mt-2">
        <Fill value={value} on={on} strong />
        <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-foreground/40" aria-hidden />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-faint">
        <span>0 no</span>
        <span>0.5 equally likely</span>
        <span>1 yes</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One request, drawn: state → typed questions → typed answers
// ---------------------------------------------------------------------------

const FLOW = {
  state: 'My card was charged twice for order 8812.',
  questions: [
    { type: 'choice' as const, id: 'department', answer: 'billing', value: 0.91 },
    { type: 'score' as const, id: 'severity', answer: '1.2 of 2', value: 0.6 },
    { type: 'noul' as const, id: 'wants_human', answer: '0.08 yes', value: 0.08 },
  ],
}

function FlowArrow({ on, delay }: { on: boolean; delay: number }) {
  return (
    <div className="flex items-center justify-center py-1 md:px-1 md:py-0" aria-hidden>
      <span className="relative block h-6 w-px overflow-hidden bg-border md:h-px md:w-10">
        <span
          className={cn(
            'absolute left-0 top-0 block bg-foreground transition-all duration-500 ease-signal',
            on ? 'h-full w-full' : 'h-0 w-full md:h-full md:w-0'
          )}
          style={{ transitionDelay: `${delay}ms` }}
        />
      </span>
    </div>
  )
}

/**
 * The whole contract in one picture. Plays once when scrolled into view;
 * "Replay" runs it again.
 */
export function RequestFlow({ className }: { className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.4)
  const reduced = useReducedMotion()
  const [stage, setStage] = React.useState(0)

  const play = React.useCallback(() => {
    if (reduced) return setStage(3)
    setStage(0)
    const t = [setTimeout(() => setStage(1), 150), setTimeout(() => setStage(2), 900), setTimeout(() => setStage(3), 1650)]
    return () => t.forEach(clearTimeout)
  }, [reduced])

  React.useEffect(() => {
    if (seen) return play()
  }, [seen, play])

  const card = 'rounded-[14px] border border-border bg-card p-4 shadow-card transition-all duration-500 ease-signal'

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="grid max-md:grid-cols-1 items-stretch md:grid-cols-[1fr_auto_1.1fr_auto_1.1fr]">
        {/* 1. State */}
        <div className={cn(card, stage >= 1 ? 'opacity-100' : 'translate-y-1 opacity-0')}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">1 · State</p>
          <p className="mt-2 text-[13.5px] leading-relaxed">&ldquo;{FLOW.state}&rdquo;</p>
          <p className="mt-2 text-[11.5px] text-faint">Read once, for every question</p>
        </div>

        <FlowArrow on={stage >= 2} delay={0} />

        {/* 2. Questions */}
        <div className={cn(card, stage >= 2 ? 'opacity-100' : 'translate-y-1 opacity-0')}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">2 · Typed questions</p>
          <ul className="mt-2 space-y-1.5">
            {FLOW.questions.map((q, i) => (
              <li
                key={q.id}
                className="flex items-center gap-2 transition-opacity duration-300"
                style={{ opacity: stage >= 2 ? 1 : 0, transitionDelay: `${i * 120}ms` }}
              >
                <TypeBadge type={q.type} className="h-5 px-1.5 text-[9.5px]" />
                <span className="font-mono text-[12px] text-muted-foreground">{q.id}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-faint">All in one request</p>
        </div>

        <FlowArrow on={stage >= 3} delay={0} />

        {/* 3. Answers */}
        <div className={cn(card, stage >= 3 ? 'opacity-100' : 'translate-y-1 opacity-0')}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">3 · Typed answers</p>
          <ul className="mt-2 space-y-2">
            {FLOW.questions.map((q, i) => (
              <li key={q.id}>
                <div className="flex justify-between text-[12px]">
                  <span className="font-mono text-muted-foreground">{q.id}</span>
                  <span className="num font-medium">{q.answer}</span>
                </div>
                <Fill value={q.value} on={stage >= 3} strong delay={i * 140} className="mt-1" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-faint">Probabilities, not prose. Your code decides.</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11.5px] text-faint">
        <span>Illustrative numbers — run it in the playground for real ones.</span>
        {!reduced && (
          <button type="button" onClick={play} className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
            Replay ↻
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact flow for narrow columns (the lesson sidebar)
// ---------------------------------------------------------------------------

export function RequestFlowCompact({ className }: { className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const step = 'rounded-[12px] border border-border bg-card px-3.5 py-2.5 shadow-card transition-all duration-500 ease-signal'
  const rows: Array<{ label: string; body: React.ReactNode }> = [
    { label: 'State', body: <span className="text-[12.5px]">&ldquo;{FLOW.state}&rdquo;</span> },
    {
      label: 'Questions',
      body: (
        <span className="flex flex-wrap gap-1">
          {FLOW.questions.map((q) => (
            <TypeBadge key={q.id} type={q.type} className="h-5 px-1.5 text-[9.5px]" />
          ))}
        </span>
      ),
    },
    {
      label: 'Answers',
      body: (
        <span className="block space-y-1.5">
          {FLOW.questions.map((q, i) => (
            <span key={q.id} className="flex items-center gap-2">
              <span className="w-[74px] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground">{q.id}</span>
              <Fill value={q.value} on={on} strong delay={500 + i * 120} className="flex-1" />
            </span>
          ))}
        </span>
      ),
    },
  ]
  return (
    <div ref={ref} className={cn('space-y-1.5', className)}>
      {rows.map((r, i) => (
        <React.Fragment key={r.label}>
          {i > 0 && <span className="mx-auto block h-3 w-px bg-border" aria-hidden />}
          <div className={cn(step, on ? 'opacity-100' : 'translate-y-1 opacity-0')} style={{ transitionDelay: `${i * 180}ms` }}>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{r.label}</p>
            {r.body}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confidence → policy: three bands and an answer landing in one
// ---------------------------------------------------------------------------

export function ConfidenceViz({ className }: { className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const bands = [
    { from: 0, to: 0.5, label: 'A person decides' },
    { from: 0.5, to: 0.85, label: 'Review' },
    { from: 0.85, to: 1, label: 'Act' },
  ]
  return (
    <div ref={ref} className={cn(className)}>
      <div className="relative flex h-9 overflow-hidden rounded-[10px] border border-border">
        {bands.map((b, i) => (
          <span
            key={b.label}
            className={cn('flex items-center justify-center border-r border-border text-[11px] last:border-r-0', i === 2 ? 'bg-foreground text-background' : i === 1 ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground')}
            style={{ width: `${(b.to - b.from) * 100}%` }}
          >
            {b.label}
          </span>
        ))}
        <span
          className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-[hsl(var(--type-score))] transition-[left] duration-1000 ease-signal"
          style={{ left: on ? '92%' : '8%' }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-faint">
        <span>0</span>
        <span>0.5</span>
        <span>0.85</span>
        <span>1 confidence</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Jev reads, code computes
// ---------------------------------------------------------------------------

export function SplitViz({ className }: { className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const items = ['kiwi', 'table', 'mango', 'plum', 'river']
  const fruit = new Set(['kiwi', 'mango', 'plum'])
  return (
    <div ref={ref} className={cn('grid grid-cols-[1fr_auto] items-center gap-3', className)}>
      <ul className="space-y-1">
        {items.map((w, i) => (
          <li key={w} className="flex items-center justify-between rounded-md bg-card px-2 py-1 text-[12px] shadow-card">
            <span className="font-mono">{w}</span>
            <span
              className={cn('font-mono text-[10.5px] transition-opacity duration-300', fruit.has(w) ? 'text-foreground' : 'text-faint')}
              style={{ opacity: on ? 1 : 0, transitionDelay: `${i * 140}ms` }}
            >
              {fruit.has(w) ? 'fruit 0.99' : 'fruit 0.01'}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="flex flex-col items-center rounded-[12px] border border-border bg-foreground px-3 py-3 text-background transition-all duration-500"
        style={{ opacity: on ? 1 : 0, transitionDelay: `${items.length * 140 + 200}ms` }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] opacity-70">your code</span>
        <span className="num mt-1 text-2xl font-semibold">3</span>
        <span className="font-mono text-[10px] opacity-70">sum(p &gt; 0.5)</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Where a request goes: nodes joined by lines with a travelling dot
// ---------------------------------------------------------------------------

const FLOW_ICONS = { monitor: Monitor, shield: ShieldCheck, cpu: Cpu, sparkles: Sparkles } as const

/** Icons go by name: server pages can't hand component functions to a client component. */
export type FlowNode = { title: string; sub?: string; icon?: keyof typeof FLOW_ICONS; tone?: 'ink' | 'plain' | 'muted' }

/** A column of nodes reached in parallel from the previous step. */
export type FlowStep = FlowNode | FlowNode[]

function FlowBox({ n, on, delay }: { n: FlowNode; on: boolean; delay: number }) {
  return (
    <div
      className={cn(
        'rounded-[14px] border px-4 py-3 shadow-card transition-all duration-500',
        n.tone === 'ink' ? 'border-foreground bg-foreground text-background' : n.tone === 'muted' ? 'border-dashed border-border bg-muted/50' : 'border-border bg-card',
        on ? 'opacity-100' : 'translate-y-1 opacity-0'
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2">
        {n.icon && React.createElement(FLOW_ICONS[n.icon], { className: 'h-4 w-4 shrink-0 opacity-80', 'aria-hidden': true })}
        <span className="text-[13.5px] font-semibold">{n.title}</span>
      </div>
      {n.sub && <p className={cn('mt-1 text-[12px] leading-snug', n.tone === 'ink' ? 'opacity-70' : 'text-muted-foreground')}>{n.sub}</p>}
    </div>
  )
}

export function DataFlow({ nodes, className }: { nodes: FlowStep[]; className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const reduced = useReducedMotion()
  return (
    <div ref={ref} className={cn('flex flex-col items-stretch md:flex-row md:items-center', className)}>
      {nodes.map((step, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="relative mx-auto block h-7 w-px bg-border md:mx-0 md:h-px md:w-auto md:min-w-10 md:flex-1" aria-hidden>
              {on && !reduced && (
                <span
                  className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground animate-[flow-y_1.8s_ease-in-out_infinite] md:left-0 md:top-1/2 md:translate-x-0 md:animate-[flow-x_1.8s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 300}ms` }}
                />
              )}
            </span>
          )}
          {Array.isArray(step) ? (
            <div className="flex flex-col gap-2 md:max-w-[240px]">
              {step.map((n, j) => (
                <FlowBox key={n.title} n={n} on={on} delay={i * 150 + j * 100} />
              ))}
            </div>
          ) : (
            <div className="md:max-w-[240px]">
              <FlowBox n={step} on={on} delay={i * 150} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A race: bars that grow in proportion to measured times
// ---------------------------------------------------------------------------

export function Race({ lanes, className }: { lanes: Array<{ label: string; ms: number; strong?: boolean }>; className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>()
  const max = Math.max(...lanes.map((l) => l.ms))
  return (
    <div ref={ref} className={cn('space-y-3', className)}>
      {lanes.map((l) => (
        <div key={l.label}>
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className={cn('font-mono', l.strong ? 'font-medium text-foreground' : 'text-muted-foreground')}>{l.label}</span>
            <span className="num font-medium">{l.ms >= 1000 ? `${(l.ms / 1000).toFixed(1)} s` : `${l.ms} ms`}</span>
          </div>
          <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className={cn('block h-full rounded-full ease-linear', l.strong ? 'bg-fill' : 'bg-faint/55')}
              style={{ width: on ? `${(l.ms / max) * 100}%` : '0%', transition: `width ${Math.max(400, (l.ms / max) * 2200)}ms linear` }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
