import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowUpRight,
  Calculator,
  CalendarX,
  Combine,
  FileStack,
  GitFork,
  Layers,
  Quote,
  Repeat2,
  ShieldAlert,
  Sigma,
  Split,
  Type,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { PageShell } from '@/components/layout/chrome'
import { TypeBadge } from '@/components/playground/type-badge'
import { ChoiceViz, NoulViz, ScoreViz } from '@/components/visuals/visuals'
import { PRICING } from '@/lib/pricing'
import { pastel } from '@/components/visuals/pastel'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Cheatsheet',
  description: 'One page: the three question types, the limits, the patterns and the failure modes.',
}

const TYPES = [
  {
    type: 'choice' as const,
    when: 'One of a known set',
    Viz: ChoiceViz,
    returns: 'choice · probabilities · confidence',
    limit: 'up to 255 options',
    tip: 'Always add an escape option like “other”.',
  },
  {
    type: 'score' as const,
    when: 'A place on a described scale',
    Viz: ScoreViz,
    returns: 'score · probabilities · confidence',
    limit: '2–10 levels',
    tip: 'Describe situations, not degrees.',
  },
  {
    type: 'noul' as const,
    when: 'A clean yes or no',
    Viz: NoulViz,
    returns: 'noul (0–1) · no confidence',
    limit: 'one condition each',
    tip: '0.5 means “equally likely”, not “medium”.',
  },
]

const STATS = [
  { value: `$${PRICING.jev.inPerM}`, label: 'per 1M input tokens', note: 'output is free' },
  { value: '64k', label: 'tokens per request', note: '32k for state + longest question' },
  { value: '1,200', label: 'requests / min', note: '250k tokens / sec' },
  { value: 'Text', label: 'only', note: 'string, object or array' },
]

const PATTERNS: Array<{ Icon: LucideIcon; name: string; line: string; stat?: string }> = [
  { Icon: GitFork, name: 'Speculative fan-out', line: 'Ask everything in one request; ignore what doesn’t apply.', stat: '12.2× cheaper' },
  { Icon: Split, name: 'Confidence routing', line: 'The answer says what; confidence says whether to act.' },
  { Icon: Combine, name: 'Composite scoring', line: 'Several Scores, normalised, weighted in your code.' },
  { Icon: Waypoints, name: 'Intent routing', line: 'Jev classifies; code, an LLM or a person handles it.' },
]

const BREAKS: Array<{ Icon: LucideIcon; label: string; href: string }> = [
  { Icon: Quote, label: 'Literal reading', href: '/limits#literal' },
  { Icon: Calculator, label: 'Counting & maths', href: '/limits#math' },
  { Icon: CalendarX, label: 'Comparing dates', href: '/limits#dates' },
  { Icon: Repeat2, label: 'Double negatives', href: '/limits#indirection' },
  { Icon: FileStack, label: 'Huge noisy state', href: '/limits#big-state' },
  { Icon: ShieldAlert, label: 'Injected content', href: '/limits#injected' },
  { Icon: Layers, label: 'Contradicting criteria', href: '/limits#contradictions' },
  { Icon: Sigma, label: 'Invariants ≠ 1', href: '/limits#invariants' },
  { Icon: Type, label: 'Generating text', href: '/limits#generation' },
]

const TRICKS = [
  'Pair a Choice with a Noul to allow “none of these”.',
  'Combine confidences with min, not a product.',
  'Let Jev pick from candidates your code found.',
  'Cache answers; re-tune thresholds for free.',
  'Point at state fields with `ticket.messages[0].text`.',
]

function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{children}</h2>
}

export default function CheatsheetPage() {
  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em]">Cheatsheet</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">Jev on one page.</p>
        </div>
        <Link href="/play" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Try it in the playground <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* The three types */}
      <section className="mt-10" aria-label="The three question types">
        <Label>Three question types</Label>
        <div className="mt-3 grid max-md:grid-cols-1 gap-3 md:grid-cols-3">
          {TYPES.map(({ type, when, Viz, returns, limit, tip }) => (
            <article key={type} className="flex flex-col rounded-[16px] border border-border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <TypeBadge type={type} />
                <span className="text-[11.5px] text-faint">{limit}</span>
              </div>
              <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.01em]">{when}</h3>
              <Viz className="mt-4 flex-1" />
              <p className="mt-4 border-t border-dashed border-border pt-3 font-mono text-[11px] text-muted-foreground">{returns}</p>
              <p className="mt-1.5 text-[12.5px] text-foreground/80">{tip}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <section className="mt-10" aria-label="Limits and price">
        <Label>Limits and price</Label>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className={cn('rounded-[16px] border px-5 py-4 shadow-card', pastel(i))}>
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <span className="num block text-[26px] font-semibold leading-none tracking-[-0.02em]">{s.value}</span>
                <span className="mt-1.5 block text-[13px] text-foreground/80">{s.label}</span>
                <span className="mt-0.5 block text-[11.5px] text-faint">{s.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 text-[12.5px] text-muted-foreground">
          <span className="font-mono text-xs">jev-latest</span> and <span className="font-mono text-xs">jev-preview</span>{' '}
          both point at <span className="font-mono text-xs">jev-1.13.0</span>. Pin the version once you tune thresholds.
        </p>
      </section>

      {/* Patterns */}
      <section className="mt-10" aria-label="Patterns">
        <Label>Patterns</Label>
        <div className="mt-3 grid max-md:grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PATTERNS.map(({ Icon, name, line, stat }, i) => (
            <div key={name} className="rounded-[16px] border border-border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[hsl(var(--pop-line))] text-foreground', pastel(i + 1))} aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                {stat && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">{stat}</span>}
              </div>
              <h3 className="mt-3 text-[14.5px] font-semibold">{name}</h3>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Breaks + tricks */}
      <div className="mt-10 grid max-md:grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-label="Where jev-1.13 breaks">
          <div className="flex items-baseline justify-between">
            <Label>Where jev-1.13 breaks</Label>
            <Link href="/limits" className="text-[12.5px] text-muted-foreground hover:text-foreground">
              Run them →
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BREAKS.map(({ Icon, label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="shadow-card flex h-full items-center gap-2.5 rounded-[12px] border bg-card px-3 py-2.5 text-[13px]"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Tricks worth knowing">
          <Label>Tricks</Label>
          <ul className="mt-3 divide-y divide-border rounded-[16px] border border-border bg-card shadow-card">
            {TRICKS.map((t, i) => (
              <li key={t} className="flex gap-3 px-4 py-2.5 text-[13px]">
                <span className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-foreground/85">{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="group mt-10 rounded-[16px] border border-border bg-card px-5 py-3.5 shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          The raw request
          <span className="text-xs font-normal text-faint group-open:hidden">show</span>
          <span className="hidden text-xs font-normal text-faint group-open:inline">hide</span>
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-[12px] bg-muted/50 p-4 font-mono text-[11.5px] leading-relaxed">
{`POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY

{
  "state": "My card was charged twice.",
  "model": "jev-latest",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": { "billing": "Charges and refunds",
                    "technical": "Bugs and integrations",
                    "other": "None of the above" }
    },
    "is_urgent": { "type": "noul", "instructions": "Does this convey urgency?" }
  }
}`}
        </pre>
      </details>
    </PageShell>
  )
}
