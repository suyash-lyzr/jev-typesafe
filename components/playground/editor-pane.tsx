'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronUp, Copy, MoreVertical, Play, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePlayground } from '@/lib/store'
import {
  approxRequestTokens,
  approxTokens,
  KNOWN_MODELS,
  MAX_CHOICE_OPTIONS,
  MAX_SCORE_LEVELS,
  Question as QuestionSchema,
  isEditorQuestionId,
  type Question,
  type QuestionType,
} from '@/lib/schema'
import { hasBlockingLint } from '@/lib/lints'
import { uniqueId } from '@/lib/serialize'
import { useModKey } from './use-mod-key'
import { StepLabel, TypeBadge } from './type-badge'

/**
 * The left-hand pane: the state, the questions, and everything that stops a
 * request from being worth less than it could be.
 */

const JsonEditor = dynamic(() => import('./json-editor'), {
  ssr: false,
  loading: () => <Skeleton className="h-[140px] w-full" />,
})

const TYPE_LABEL: Record<QuestionType, string> = { choice: 'CHOICE', score: 'SCORE', noul: 'NOUL' }

const TYPE_BLURB: Record<QuestionType, string> = {
  choice: 'Pick one of a fixed set of options',
  score: 'Place the state on ordered levels',
  noul: 'The probability a statement is true',
}

const isStructured = (v: unknown) => v !== null && typeof v === 'object'

// ---------------------------------------------------------------------------
// Panels: the left pane mirrors the right — white cards on a tinted pane.
// ---------------------------------------------------------------------------

function Panel({
  labelledBy,
  header,
  footer,
  children,
  className,
}: {
  labelledBy: string
  header: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn('overflow-hidden rounded-[16px] border border-border bg-card shadow-card', className)}
    >
      <header className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border px-4 py-2.5">{header}</header>
      {children}
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-muted/35 px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function StateEditor({ numbered = true }: { numbered?: boolean } = {}) {
  const { state, stateMode, setState, setStateMode, setStateError, stateError, lastRun, isDirtySinceRun, loadCount } =
    usePlayground()

  const rendered = typeof state === 'string' ? state : JSON.stringify(state, null, 2)
  const [text, setText] = React.useState(rendered)
  /** What this editor last wrote to the store, so its own echo is not re-rendered over the cursor. */
  const lastWritten = React.useRef<unknown>(state)

  // Follow the store only when something else replaced the state (a preset,
  // a shared link, a mode switch) — never in response to our own typing.
  // A load always resyncs, even when it restores the very same state object:
  // invalid text that never reached the store must not survive a Reset.
  const seenLoad = React.useRef(loadCount)
  React.useEffect(() => {
    const reloaded = seenLoad.current !== loadCount
    seenLoad.current = loadCount
    if (!reloaded && state === lastWritten.current) return
    lastWritten.current = state
    setText(typeof state === 'string' ? state : JSON.stringify(state, null, 2))
  }, [state, loadCount])

  const commit = (next: string) => {
    setText(next)

    if (stateMode === 'text') {
      lastWritten.current = next
      setState(next)
      setStateError(null)
      return
    }

    try {
      const parsed = JSON.parse(next)
      if (parsed === null || typeof parsed !== 'object') {
        // JSON mode sends an object or an array; a bare number or string is
        // not something the API takes as a state.
        setStateError('JSON mode sends an object or an array. Switch to Text to send plain text.')
        return
      }
      lastWritten.current = parsed
      setState(parsed)
      setStateError(null)
    } catch (err) {
      setStateError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }

  const questions = usePlayground((st) => st.questions)
  const variants = usePlayground((st) => st.variants)
  const stateTokens = approxTokens(state)
  // Variants travel as extra questions (id__B), so they count toward the request.
  const requestEstimate = approxRequestTokens(state, { ...questions, ...variants })
  // Jev's own count is for the whole request, and only while nothing has changed since the run.
  const measured = lastRun?.usage && !isDirtySinceRun() ? lastRun.usage.input_tokens : null
  const stringInJsonMode = stateMode === 'json' && typeof state === 'string' && !stateError
  /** Set when switching plain text to JSON, which converts it into fields. */
  const [converted, setConverted] = React.useState(false)
  React.useEffect(() => setConverted(false), [loadCount])

  return (
    <div className="px-4 pt-3">
      <Panel
        labelledBy="state-heading"
        className="transition-[border-color] duration-fast focus-within:border-foreground/35"
        header={
          <>
            <StepLabel n={numbered ? 2 : undefined} id="state-heading">
              Edit the state
            </StepLabel>
            <SegmentedControl
              value={stateMode}
              onValueChange={(v) => {
                setConverted(v === 'json' && typeof state === 'string')
                setStateMode(v as 'text' | 'json')
              }}
              aria-label="State format"
            >
              <SegmentedControlItem value="text">Text</SegmentedControlItem>
              <SegmentedControlItem value="json">JSON</SegmentedControlItem>
            </SegmentedControl>
          </>
        }
        footer={
          <>
            <span>Jev reads this once, for every question.</span>
            <span className="flex items-center gap-3 font-mono tabular">
              <span title="This state alone, estimated">state ≈ {stateTokens.toLocaleString()}</span>
              <span className="text-faint" aria-hidden>·</span>
              <span
                className={measured != null ? 'text-foreground' : undefined}
                title={
                  measured != null
                    ? 'The whole request (state + questions + Jev’s fixed overhead), as Jev counted it on the last run'
                    : 'The whole request (state + questions + Jev’s fixed overhead), estimated'
                }
              >
                request {measured != null ? measured.toLocaleString() : `≈ ${requestEstimate.toLocaleString()}`} tokens
              </span>
            </span>
          </>
        }
      >
        {stateMode === 'json' ? (
          <div className="p-3">
            <JsonEditor value={text} onChange={commit} ariaLabel="State as JSON" placeholder={'{\n  "ticket": { "message": "…" }\n}'} />
          </div>
        ) : (
          <Textarea
            value={text}
            aria-label="State"
            spellCheck={false}
            onChange={(e) => commit(e.target.value)}
            className="min-h-[150px] resize-y rounded-none border-0 bg-transparent px-4 py-3.5 text-[14.5px] leading-[1.7] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Paste the text you want Jev to read…"
          />
        )}

        {stateError && (
          <p role="alert" className="mx-4 mb-3 rounded-md bg-danger-soft px-2.5 py-1.5 font-mono text-xs text-danger-text">
            {stateError} Run is off until this parses.
          </p>
        )}

        {converted && stateMode === 'json' && !stateError && (
          <p className="mx-4 mb-3 text-xs text-muted-foreground">
            Turned your text into fields, and it is now sent as this object. Switch back to Text to send plain text.
          </p>
        )}
        {stringInJsonMode && (
          <p className="mx-4 mb-3 text-xs text-muted-foreground">This is not a JSON object, so it is sent as a string.</p>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question editors
// ---------------------------------------------------------------------------

function instructionsString(q: Question): string {
  if (typeof q.instructions === 'string') return q.instructions
  return q.instructions ? JSON.stringify(q.instructions, null, 2) : ''
}

/** What the answer will be, in words — so the row explains its own type. */
function summarise(q: Question): string {
  if (q.type === 'choice') return `Picks one of ${Object.keys(q.criteria).length} options`
  if (q.type === 'score') return `A point on ${q.criteria.length} levels`
  return q.criteria ? 'Probability of yes, with criteria' : 'Probability of yes'
}

/**
 * Inputs that read as text until you touch them: no box at rest, a soft wash
 * on hover, a white field with a ring while editing. The expanded question is
 * a small document, not a form.
 */
const BARE =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition-colors duration-fast placeholder:text-faint hover:bg-muted/60 focus:border-input focus:bg-card focus:ring-2 focus:ring-ring/25'

/** Grows with its content, one line at rest. */
function BareArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={1} {...props} className={cn(BARE, 'resize-none [field-sizing:content]', className)} />
}

/** Row actions stay out of sight until the row is hovered or focused. */
const ROW_ACTIONS = 'flex shrink-0 items-center opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100'

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function FieldLabel({ children, hint, count }: { children: React.ReactNode; hint?: string; count?: string }) {
  return (
    <p className="mb-1 flex items-baseline gap-2 px-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint" title={hint}>
      {children}
      {count && <span className="tabular normal-case tracking-normal">{count}</span>}
    </p>
  )
}

function AddRow({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft disabled:pointer-events-none disabled:opacity-40"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden /> {children}
    </button>
  )
}

function StructuredNote({ value }: { value: unknown }) {
  return (
    <p
      className="flex-1 truncate rounded-md border border-dashed border-border px-2 py-1.5 font-mono text-[11px] text-muted-foreground"
      title={JSON.stringify(value)}
    >
      structured · edit in the JSON view
    </p>
  )
}

/**
 * One option. The key is edited as a draft and committed on blur, so typing
 * through a moment where it matches another key cannot merge two options.
 */
function OptionRow({
  index,
  optionKey,
  description,
  otherKeys,
  onRename,
  onDescribe,
  onRemove,
  labelPrefix,
}: {
  index: number
  optionKey: string
  description: unknown
  otherKeys: string[]
  onRename: (next: string) => void
  onDescribe: (next: string | null) => void
  onRemove: () => void
  labelPrefix: string
}) {
  const [draft, setDraft] = React.useState(optionKey)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => setDraft(optionKey), [optionKey])

  const commit = () => {
    const next = draft.trim()
    if (next === optionKey) return setError(null)
    if (!next) {
      setError('An option needs a key.')
      return setDraft(optionKey)
    }
    if (next.length > 64) {
      setError('Keys are at most 64 characters.')
      return setDraft(optionKey)
    }
    if (otherKeys.includes(next)) {
      setError(`"${next}" is already an option.`)
      return setDraft(optionKey)
    }
    setError(null)
    onRename(next)
  }

  return (
    <li className="group/row">
      <div className="grid grid-cols-[minmax(92px,34%)_minmax(0,1fr)_auto] items-start gap-1 py-0.5">
        <input
          value={draft}
          aria-label={`${labelPrefix}option ${index + 1} key`}
          aria-invalid={Boolean(error)}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={cn(BARE, 'font-mono text-[12.5px] font-medium text-[hsl(var(--type-choice))]')}
        />
        {isStructured(description) ? (
          <StructuredNote value={description} />
        ) : (
          <BareArea
            value={typeof description === 'string' ? description : ''}
            aria-label={`${labelPrefix}option ${index + 1} description`}
            placeholder="What this option covers (optional)"
            onChange={(e) => onDescribe(e.target.value || null)}
            className="text-[13px] leading-relaxed text-muted-foreground focus:text-foreground"
          />
        )}
        <span className={ROW_ACTIONS}>
          <IconAction label={`Remove ${labelPrefix}option ${optionKey}`} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconAction>
        </span>
      </div>
      {error && (
        <p role="alert" className="px-2 text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  )
}

function ChoiceFields({
  q,
  onChange,
  labelPrefix = '',
}: {
  q: Extract<Question, { type: 'choice' }>
  onChange: (patch: Partial<Question>) => void
  labelPrefix?: string
}) {
  const entries = Object.entries(q.criteria)
  const keys = entries.map(([k]) => k)
  const write = (next: Array<[string, unknown]>) => onChange({ criteria: Object.fromEntries(next) } as Partial<Question>)

  return (
    <div className="mt-4">
      <FieldLabel
        count={`${entries.length}/${MAX_CHOICE_OPTIONS}`}
        hint="Both the key and the description reach the model, so write descriptions that separate the options. An empty description is sent as null."
      >
        Options · key and what it covers
      </FieldLabel>
      <ul className="divide-y divide-dashed divide-border border-y border-dashed border-border">
        {entries.map(([key, description], i) => (
          <OptionRow
            key={`${i}-${key}`}
            index={i}
            optionKey={key}
            description={description}
            otherKeys={keys.filter((_, j) => j !== i)}
            labelPrefix={labelPrefix}
            onRename={(next) => write(entries.map(([k, v], j) => (j === i ? [next, v] : [k, v])))}
            onDescribe={(next) => write(entries.map(([k, v], j) => (j === i ? [k, next] : [k, v])))}
            onRemove={() => write(entries.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <AddRow
        disabled={entries.length >= MAX_CHOICE_OPTIONS}
        onClick={() => write([...entries, [uniqueId(`option_${entries.length + 1}`, keys), null]])}
      >
        Add option
      </AddRow>
    </div>
  )
}

/** A signal-strength glyph: one bar per level, rising, filled up to this one. */
function LevelMeter({ index, count }: { index: number; count: number }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]">
      {Array.from({ length: count }, (_, j) => (
        <span
          key={j}
          className={cn('w-[3px] rounded-[1px]', j <= index ? 'bg-[hsl(var(--type-score))]' : 'bg-[hsl(var(--type-score)/0.18)]')}
          style={{ height: `${Math.round(30 + (70 * j) / Math.max(count - 1, 1))}%` }}
        />
      ))}
    </span>
  )
}

function ScoreFields({
  q,
  onChange,
  labelPrefix = '',
}: {
  q: Extract<Question, { type: 'score' }>
  onChange: (patch: Partial<Question>) => void
  labelPrefix?: string
}) {
  const levels = q.criteria
  const write = (next: unknown[]) => onChange({ criteria: next } as Partial<Question>)
  const move = (i: number, by: -1 | 1) => {
    const next = [...levels]
    ;[next[i + by], next[i]] = [next[i], next[i + by]]
    write(next)
  }

  return (
    <div className="mt-4">
      <FieldLabel
        count={`${levels.length}/${MAX_SCORE_LEVELS}`}
        hint="Describe situations, not degrees: each level is judged on its own, so 'worse than the one before' means nothing to the model."
      >
        Levels · low to high
      </FieldLabel>
      {/* Each level carries a small rising meter, so "higher" is visible, not just a number. */}
      <ol className="divide-y divide-dashed divide-border border-y border-dashed border-border">
        {levels.map((level, i) => (
          <li key={i} className="group/row grid grid-cols-[84px_minmax(0,1fr)_auto] items-start gap-1 py-1">
            <span className="flex flex-col px-2 pt-[5px]" aria-hidden>
              <span className="flex items-center gap-2">
                <LevelMeter index={i} count={levels.length} />
                <span className="font-mono text-[12px] font-semibold tabular text-[hsl(var(--type-score))]">{i}</span>
              </span>
              {(i === 0 || i === levels.length - 1) && levels.length > 1 && (
                <span className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                  {i === 0 ? 'lowest' : 'highest'}
                </span>
              )}
            </span>
            {isStructured(level) ? (
              <StructuredNote value={level} />
            ) : (
              <BareArea
                value={typeof level === 'string' ? level : ''}
                aria-label={`${labelPrefix}level ${i}`}
                placeholder="Describe the situation at this level"
                onChange={(e) => write(levels.map((l, j) => (j === i ? e.target.value : l)))}
                className="text-[13px] leading-relaxed"
              />
            )}
            <span className={ROW_ACTIONS}>
              <IconAction label={`Move ${labelPrefix}level ${i} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label={`Move ${labelPrefix}level ${i} down`} disabled={i === levels.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label={`Remove ${labelPrefix}level ${i}`} onClick={() => write(levels.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconAction>
            </span>
          </li>
        ))}
      </ol>
      <AddRow disabled={levels.length >= MAX_SCORE_LEVELS} onClick={() => write([...levels, ''])}>
        Add level
      </AddRow>
      {levels.length >= MAX_SCORE_LEVELS && <p className="mt-1 px-2 text-xs text-faint">10 levels is the API&rsquo;s maximum.</p>}
    </div>
  )
}

function NoulFields({
  q,
  onChange,
  labelPrefix = '',
}: {
  q: Extract<Question, { type: 'noul' }>
  onChange: (patch: Partial<Question>) => void
  labelPrefix?: string
}) {
  const [open, setOpen] = React.useState(Boolean(q.criteria))
  const structured = q.criteria && (isStructured(q.criteria.true) || isStructured(q.criteria.false))

  if (structured) {
    return (
      <div className="mt-4 flex items-center gap-2 px-2">
        <span className="text-xs text-muted-foreground">yes / no criteria</span>
        <StructuredNote value={q.criteria} />
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mt-3">
        <AddRow onClick={() => setOpen(true)}>Say what counts as yes and no</AddRow>
        <p className="px-2 text-xs text-faint">Optional. Without it, Jev reads the question as written.</p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <FieldLabel>Criteria · optional</FieldLabel>
      <ul className="divide-y divide-dashed divide-border border-y border-dashed border-border">
        {(['true', 'false'] as const).map((side) => (
          <li key={side} className="flex items-start gap-1 py-0.5">
            <span
              className={cn(
                'mt-[5px] inline-flex h-[20px] w-12 shrink-0 items-center justify-center rounded-full font-mono text-[10.5px] font-semibold uppercase',
                side === 'true' ? 'bg-[hsl(var(--type-noul-soft))] text-[hsl(var(--type-noul))]' : 'bg-muted text-muted-foreground'
              )}
              aria-hidden
            >
              {side === 'true' ? 'yes' : 'no'}
            </span>
            <BareArea
              value={typeof q.criteria?.[side] === 'string' ? (q.criteria[side] as string) : ''}
              aria-label={`${labelPrefix}what a ${side === 'true' ? 'yes' : 'no'} means`}
              placeholder={`What counts as ${side === 'true' ? 'yes' : 'no'}`}
              onChange={(e) =>
                onChange({
                  criteria: { true: q.criteria?.true ?? '', false: q.criteria?.false ?? '', [side]: e.target.value },
                } as Partial<Question>)
              }
              className="text-[13px] leading-relaxed"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          onChange({ criteria: undefined } as Partial<Question>)
          setOpen(false)
        }}
        className="mt-1 rounded-md px-2 py-1 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Remove criteria
      </button>
    </div>
  )
}

function QuestionFields({
  q,
  onChange,
  labelPrefix,
}: {
  q: Question
  onChange: (patch: Partial<Question>) => void
  labelPrefix?: string
}) {
  if (q.type === 'choice') return <ChoiceFields q={q} onChange={onChange} labelPrefix={labelPrefix} />
  if (q.type === 'score') return <ScoreFields q={q} onChange={onChange} labelPrefix={labelPrefix} />
  return <NoulFields q={q} onChange={onChange} labelPrefix={labelPrefix} />
}

/** The question itself, set as the card's headline. */
function InstructionsField({ q, onChange, label }: { q: Question; onChange: (text: string) => void; label: string }) {
  if (isStructured(q.instructions)) {
    return (
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-muted-foreground">instructions</span>
        <StructuredNote value={q.instructions} />
      </div>
    )
  }
  return (
    <BareArea
      value={instructionsString(q)}
      aria-label={label}
      placeholder={TYPE_BLURB[q.type]}
      onChange={(e) => onChange(e.target.value)}
      className="text-[15px] font-medium leading-snug text-foreground"
    />
  )
}

function QuestionCard({ id, q }: { id: string; q: Question }) {
  const {
    updateQuestion,
    renameQuestion,
    duplicateQuestion,
    deleteQuestion,
    moveQuestion,
    addVariant,
    removeVariant,
    updateVariant,
    variants,
    selectedQuestion,
    selectQuestion,
  } = usePlayground()

  const [open, setOpen] = React.useState(false)
  const [draftId, setDraftId] = React.useState(id)
  const [idError, setIdError] = React.useState<string | null>(null)
  React.useEffect(() => setDraftId(id), [id])

  const variant = Object.hasOwn(variants, id) ? variants[id] : undefined
  const ref = React.useRef<HTMLDivElement>(null)

  // A result card or lint "show" selects this question: bring it into view.
  React.useEffect(() => {
    if (selectedQuestion === id) {
      setOpen(true)
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedQuestion, id])

  const commitId = () => {
    const next = draftId.trim()
    if (next === id) return setIdError(null)
    const refusal = renameQuestion(id, next)
    if (refusal) {
      setIdError(refusal)
      setDraftId(id)
    } else {
      setIdError(null)
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        // A row in the Questions panel. Open or selected, it gets a type-coloured edge.
        'relative transition-colors duration-fast',
        open && 'bg-muted/30',
        (open || selectedQuestion === id) &&
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        (open || selectedQuestion === id) && q.type === 'choice' && 'before:bg-[hsl(var(--type-choice))]',
        (open || selectedQuestion === id) && q.type === 'noul' && 'before:bg-[hsl(var(--type-noul))]',
        (open || selectedQuestion === id) && q.type === 'score' && 'before:bg-[hsl(var(--type-score))]'
      )}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label={`Edit ${id}`}
          className="group grid w-full grid-cols-[68px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3.5 text-left transition-colors duration-fast hover:bg-muted/40"
        >
          <span className="pt-px">
            <TypeBadge type={q.type} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium leading-snug text-foreground">
              {instructionsString(q) || <span className="font-normal text-faint">No question yet</span>}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-faint">
              <span className="truncate font-mono">{id}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{summarise(q)}</span>
              {variant && <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10.5px]">A/B</span>}
            </span>
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 text-faint transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
        </button>
      ) : (
        <div className="px-3 pb-4 pt-3">
          {/* Header: type, id, actions. The id reads as a label until clicked. */}
          <div className="flex items-center gap-1.5 pl-1">
            <TypeBadge type={q.type} />
            <input
              value={draftId}
              aria-label="Question id"
              aria-invalid={Boolean(idError)}
              spellCheck={false}
              onChange={(e) => setDraftId(e.target.value)}
              onBlur={commitId}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onFocus={() => selectQuestion(id)}
              style={{ width: `${Math.max(draftId.length, 4) + 3}ch` }}
              className={cn(BARE, 'max-w-[220px] font-mono text-xs text-muted-foreground')}
            />

            <div className="ml-auto flex items-center">
              {q.type !== 'noul' && (
                <button
                  type="button"
                  onClick={() => (variant ? removeVariant(id) : addVariant(id))}
                  title="Try a second wording in the same request"
                  className="h-7 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {variant ? 'Remove B' : 'A/B test'}
                </button>
              )}
              <IconAction label={`Duplicate ${id}`} onClick={() => duplicateQuestion(id)}>
                <Copy className="h-3.5 w-3.5" />
              </IconAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`More actions for ${id}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-muted hover:text-foreground"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => moveQuestion(id, -1)}>Move up</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => moveQuestion(id, 1)}>Move down</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deleteQuestion(id)} className="text-danger-text">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <IconAction label={`Collapse ${id}`} onClick={() => setOpen(false)}>
                <ChevronUp className="h-4 w-4" />
              </IconAction>
            </div>
          </div>

          {idError && (
            <p role="alert" className="mt-1 px-3 text-xs text-danger-text">
              {idError}
            </p>
          )}

          <div className="mt-2">
            <FieldLabel>Question</FieldLabel>
            <InstructionsField q={q} label={`Instructions for ${id}`} onChange={(text) => updateQuestion(id, { instructions: text })} />

            <QuestionFields q={q} onChange={(patch) => updateQuestion(id, patch)} />

            {variant && (
              <div className="mt-4 rounded-[10px] bg-muted/50 px-1 pb-2 pt-2.5">
                <p className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
                  Variant B · sent in the same request as <span className="font-mono">{id}__B</span>
                </p>
                <InstructionsField
                  q={variant}
                  label={`Variant B instructions for ${id}`}
                  onChange={(text) => updateVariant(id, { instructions: text })}
                />
                <QuestionFields q={variant} onChange={(patch) => updateVariant(id, patch)} labelPrefix="variant B " />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Questions: form and JSON views of the same map
// ---------------------------------------------------------------------------

/** The fields System One reads on a question. Anything else is not sent. */
const QUESTION_FIELDS = new Set(['type', 'instructions', 'criteria'])

function extraFields(questions: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const [id, q] of Object.entries(questions)) {
    if (!q || typeof q !== 'object') continue
    for (const key of Object.keys(q)) if (!QUESTION_FIELDS.has(key)) out.push(`${id}.${key}`)
  }
  return out
}

function QuestionsJson() {
  const { questions, replaceQuestions, questionsError: error, setQuestionsError: setError, loadCount } = usePlayground()
  const text = React.useMemo(() => JSON.stringify(questions, null, 2), [questions])
  const extras = React.useMemo(() => extraFields(questions), [questions])

  // Leaving this view must not leave a stale "cannot run" behind.
  React.useEffect(() => () => setError(null), [setError])

  const onChange = (next: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON')
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Questions are an object: { "id": { "type": …, "instructions": … } }.')
      return
    }
    for (const [id, q] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isEditorQuestionId(id)) {
        setError(`"${id}" is not a valid question id (letters, digits, _ or -, not ending in __A or __B).`)
        return
      }
      const check = QuestionSchema.safeParse(q)
      if (!check.success) {
        setError(`${id}: ${check.error.issues[0]?.message ?? 'not a valid question'}`)
        return
      }
    }
    setError(null)
    // Replace with the parsed objects as written: unknown fields ride along.
    replaceQuestions(parsed as Record<string, Question>)
  }

  return (
    <div>
      {/* Remounted on every load, so uncommitted invalid text is replaced too. */}
      <JsonEditor key={loadCount} value={text} onChange={onChange} ariaLabel="Questions as JSON" minHeight={220} />
      {error ? (
        <p role="alert" className="mt-1 rounded bg-danger-soft px-2 py-1 font-mono text-xs text-danger-text">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-xs text-faint">Paste a cookbook&rsquo;s questions; structured values are kept as written.</p>
      )}
      {!error && extras.length > 0 && (
        <p className="mt-1 rounded bg-warning-soft px-2 py-1 text-xs text-warning-text">
          Extra fields, not sent to Jev: <span className="font-mono">{extras.join(', ')}</span>. A question
          carries only <span className="font-mono">type</span>, <span className="font-mono">instructions</span>{' '}
          and <span className="font-mono">criteria</span>.
        </p>
      )}
    </div>
  )
}

export function QuestionsList({ numbered = true }: { numbered?: boolean } = {}) {
  const { questions, variants, addQuestion } = usePlayground()
  const [view, setView] = React.useState<'form' | 'json'>('form')
  const entries = Object.entries(questions)
  const tokens = entries.reduce(
    (sum, [id, q]) => sum + approxTokens(q) + (Object.hasOwn(variants, id) ? approxTokens(variants[id]) : 0),
    0
  )

  return (
    <div className="px-4 pb-4 pt-3">
      <Panel
        labelledBy="questions-heading"
        header={
          <>
            <StepLabel n={numbered ? 3 : undefined} id="questions-heading">
              Ask typed questions
            </StepLabel>
            <span className="font-mono text-xs tabular text-faint" title="Estimated tokens for all questions">
              ≈ {tokens.toLocaleString()} tokens
            </span>
          </>
        }
        footer={
          <>
            {view === 'form' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="-ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-foreground hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add question
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(['choice', 'noul', 'score'] as QuestionType[]).map((type) => (
                    <DropdownMenuItem key={type} onClick={() => addQuestion(type)} className="gap-2">
                      <TypeBadge type={type} className="h-5 px-1.5 text-[10px]" />
                      <span className="text-xs text-muted-foreground">{TYPE_BLURB[type]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setView(view === 'form' ? 'json' : 'form')}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {view === 'form' ? 'Edit as JSON' : 'Back to the form'}
            </button>
          </>
        }
      >
        {view === 'json' ? (
          <div className="p-3">
            <QuestionsJson />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No questions yet. Add a Choice, Score or Noul — they all travel in one request.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {entries.map(([id, q]) => (
              <QuestionCard key={id} id={id} q={q} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lints and the run bar
// ---------------------------------------------------------------------------

export function LintBar() {
  const { lints, applyFix, selectQuestion } = usePlayground()
  const all = lints()
  const blocking = all.filter((l) => l.severity === 'block').length
  // Collapsed by default; a blocking lint opens it, since it stops Run.
  const [open, setOpen] = React.useState(false)
  const expanded = open || blocking > 0
  if (all.length === 0) return null

  return (
    <div className="border-t border-border bg-sidebar">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {/* Only the summary is live: re-announcing every lint on each keystroke is noise. */}
        <span aria-live="polite" className="flex items-center gap-2">
          <span
            className={cn('h-1.5 w-1.5 rounded-full', blocking > 0 ? 'bg-danger' : 'bg-warning')}
            aria-hidden
          />
          {all.length} suggestion{all.length === 1 ? '' : 's'}
          {blocking > 0 ? ` · ${blocking} blocking` : ''}
        </span>
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>
      {expanded && (
        <ul className="max-h-48 space-y-2 overflow-y-auto px-4 pb-3">
          {all.map((lint, i) => (
            <li key={`${lint.id}-${lint.questionId ?? ''}-${i}`} className="flex gap-2 text-xs">
              <span
                className={cn(
                  'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
                  lint.severity === 'block' ? 'bg-danger' : lint.severity === 'warn' ? 'bg-warning' : 'bg-faint'
                )}
                aria-label={lint.severity === 'block' ? 'Blocking' : lint.severity === 'warn' ? 'Warning' : 'Note'}
              />
              <span className="min-w-0">
                <span className="text-muted-foreground">{lint.message}</span>
                <span className="ml-2 inline-flex gap-3">
                  {lint.fix && (
                    <button type="button" onClick={() => applyFix(lint.fix!.kind)} className="font-medium text-brand hover:underline">
                      {lint.fix.label}
                    </button>
                  )}
                  {lint.questionId && (
                    <button type="button" onClick={() => selectQuestion(lint.questionId!)} className="text-brand hover:underline">
                      show
                    </button>
                  )}
                  {lint.learnHref && (
                    // A new tab: following it must not throw away the request being edited.
                    <a href={lint.learnHref} target="_blank" rel="noopener" className="text-brand hover:underline">
                      why ↗
                    </a>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** What each model name means, from docs.typesafe.ai/models (checked 2026-09-22). */
const MODEL_NOTES: Record<string, string> = {
  'jev-latest': 'Newest stable release. Today: jev-1.13.0',
  'jev-1.13.0': 'Pinned version. Answers never shift under you',
  'jev-preview': 'Newest build, official or not. Today: same as latest',
}

function ModelPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (m: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Model: ${value}`}
          className="group flex h-10 shrink-0 flex-col items-start justify-center rounded-[10px] border border-border bg-card pl-3 pr-8 text-left shadow-card transition-colors duration-fast hover:border-faint data-[state=open]:border-foreground/40 relative"
        >
          <span className="text-[10px] font-medium uppercase leading-none tracking-[0.1em] text-faint">Model</span>
          <span className="mt-1 font-mono text-[12.5px] font-medium leading-none text-foreground">{value}</span>
          <ChevronDown
            className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint transition-transform duration-fast group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={6} className="w-[280px] rounded-[12px] p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Model</p>
        {options.map((m) => (
          <DropdownMenuItem
            key={m}
            onClick={() => onChange(m)}
            className={cn('flex items-start gap-2.5 rounded-[8px] px-2 py-2', m === value && 'bg-muted')}
          >
            <span
              className={cn(
                'mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                m === value ? 'border-foreground bg-foreground' : 'border-input'
              )}
              aria-hidden
            >
              {m === value && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[12.5px] font-medium text-foreground">{m}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                {MODEL_NOTES[m] ?? 'From a shared link or an older run'}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function runLabel(count: number): string {
  if (count === 1) return 'Run the question'
  if (count === 2) return 'Run both questions'
  return `Run all ${WORDS[count] ?? count} questions`
}

export function RunBar() {
  const { run, running, canRun, questions, variants, compareOn, compareModel, model, setModel, lints, stateError, questionsError } =
    usePlayground()
  const mod = useModKey()

  const count = Object.keys(questions).length + Object.keys(variants).length
  const blocked = hasBlockingLint(lints())
  // A shared link or an old run can carry a model the picker does not list;
  // show it rather than display one model while sending another.
  const models: string[] = (KNOWN_MODELS as readonly string[]).includes(model) ? [...KNOWN_MODELS] : [model, ...KNOWN_MODELS]

  return (
    <div className="space-y-2 border-t border-border bg-sidebar/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <ModelPicker value={model} options={models} onChange={setModel} />

        <Button onClick={() => run()} disabled={!canRun()} className="h-10 min-w-0 flex-1 rounded-[10px] text-sm font-medium">
          {running ? (
            'Running…'
          ) : (
            <>
              <Play className="mr-2 h-3.5 w-3.5 fill-current" aria-hidden />
              <span className="truncate">{runLabel(count)}{compareOn ? ` + ${compareModel}` : ''}</span>
              <Kbd className="ml-3 hidden border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/70 sm:inline-flex">{mod}↵</Kbd>
            </>
          )}
        </Button>
      </div>

      {(blocked || stateError || questionsError) && (
        <p className="w-full text-xs text-danger-text">
          {stateError
            ? 'Fix the state to run.'
            : questionsError
              ? 'Fix the questions JSON to run.'
              : 'Fix the blocking lints to run.'}
        </p>
      )}
    </div>
  )
}
