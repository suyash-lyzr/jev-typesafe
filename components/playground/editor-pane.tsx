'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronRight, Copy, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePlayground } from '@/lib/store'
import {
  estimateTokens,
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
// State
// ---------------------------------------------------------------------------

export function StateEditor() {
  const { state, stateMode, setState, setStateMode, setStateError, stateError, lastRun, isDirtySinceRun, compareOn, loadCount } =
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

  const tokens = estimateTokens(state)
  const showLiveTokens = !lastRun?.usage || isDirtySinceRun()
  const stringInJsonMode = stateMode === 'json' && typeof state === 'string' && !stateError

  return (
    <section className="border-b border-border p-4" aria-labelledby="state-heading">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 id="state-heading" className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          State
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular text-muted-foreground">
            {showLiveTokens ? `≈ ${tokens.toLocaleString()} tok` : `${lastRun!.usage!.input_tokens} tok`}
          </span>
          <SegmentedControl value={stateMode} onValueChange={(v) => setStateMode(v as 'text' | 'json')} aria-label="State format">
            <SegmentedControlItem value="text">Text</SegmentedControlItem>
            <SegmentedControlItem value="json">JSON</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </header>

      {stateMode === 'json' ? (
        <JsonEditor value={text} onChange={commit} ariaLabel="State as JSON" placeholder={'{\n  "ticket": { "message": "…" }\n}'} />
      ) : (
        <Textarea
          value={text}
          aria-label="State"
          spellCheck={false}
          onChange={(e) => commit(e.target.value)}
          className="min-h-[140px] resize-y"
          placeholder="Paste the text you want Jev to read…"
        />
      )}

      {stateError && (
        <p role="alert" className="mt-1 rounded bg-danger-soft px-2 py-1 font-mono text-xs text-danger-text">
          {stateError} Run is off until this parses — the last valid state would not be what you see.
        </p>
      )}

      {stringInJsonMode && (
        <p className="mt-1 text-xs text-muted-foreground">This is not a JSON object, so it is sent as a string.</p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Sample or synthetic text only. Don&rsquo;t paste API keys, passwords, personal data or
        confidential customer content. Your state is sent through Lyzr&rsquo;s server to TypeSafe
        {compareOn ? ' and, with Compare on, to OpenAI' : ''}, and is not stored there.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Question editors
// ---------------------------------------------------------------------------

function instructionsString(q: Question): string {
  if (typeof q.instructions === 'string') return q.instructions
  return q.instructions ? JSON.stringify(q.instructions, null, 2) : ''
}

function summarise(q: Question): string {
  if (q.type === 'choice') return `${Object.keys(q.criteria).length} options`
  if (q.type === 'score') return `${q.criteria.length} levels`
  return q.criteria ? 'yes/no with criteria' : 'yes/no'
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
    <div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          aria-label={`${labelPrefix}option ${index + 1} key`}
          aria-invalid={Boolean(error)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-40 shrink-0 font-mono text-xs"
        />
        {isStructured(description) ? (
          <StructuredNote value={description} />
        ) : (
          <Input
            value={typeof description === 'string' ? description : ''}
            aria-label={`${labelPrefix}option ${index + 1} description`}
            placeholder="What this option covers (optional)"
            onChange={(e) => onDescribe(e.target.value || null)}
            className="flex-1 text-xs"
          />
        )}
        <Button variant="ghost" size="icon" aria-label={`Remove ${labelPrefix}option ${optionKey}`} onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-0.5 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
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
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Options ({entries.length} of {MAX_CHOICE_OPTIONS}) &middot; key &middot; description
      </p>
      <div className="space-y-1.5">
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
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={entries.length >= MAX_CHOICE_OPTIONS}
        onClick={() => write([...entries, [uniqueId(`option_${entries.length + 1}`, keys), null]])}
      >
        <Plus className="mr-1 h-3 w-3" /> option
      </Button>
      <p className="mt-1.5 text-xs text-muted-foreground">
        An empty description is sent as null. Both the key and the description reach the model, so
        write descriptions that separate the options from each other.
      </p>
    </div>
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

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Levels, low to high ({levels.length} of {MAX_SCORE_LEVELS})
      </p>
      <div className="space-y-1.5">
        {levels.map((level, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i}</span>
            {isStructured(level) ? (
              <StructuredNote value={level} />
            ) : (
              <Input
                value={typeof level === 'string' ? level : ''}
                aria-label={`${labelPrefix}level ${i}`}
                placeholder="Describe the situation at this level"
                onChange={(e) => write(levels.map((l, j) => (j === i ? e.target.value : l)))}
                className="flex-1 text-xs"
              />
            )}
            <div className="flex shrink-0">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${labelPrefix}level ${i} up`}
                disabled={i === 0}
                onClick={() => {
                  const next = [...levels]
                  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                  write(next)
                }}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${labelPrefix}level ${i} down`}
                disabled={i === levels.length - 1}
                onClick={() => {
                  const next = [...levels]
                  ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                  write(next)
                }}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${labelPrefix}level ${i}`}
                onClick={() => write(levels.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={levels.length >= MAX_SCORE_LEVELS}
        onClick={() => write([...levels, ''])}
      >
        <Plus className="mr-1 h-3 w-3" /> level
      </Button>
      {levels.length >= MAX_SCORE_LEVELS && (
        <p className="mt-1.5 text-xs text-muted-foreground">The API accepts at most 10 levels; an eleventh is rejected.</p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Describe situations, not degrees. Each level is judged on its own, so &ldquo;worse than the
        one before&rdquo; means nothing to the model.
      </p>
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
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">yes / no criteria</span>
        <StructuredNote value={q.criteria} />
      </div>
    )
  }

  return (
    <div className="mt-3">
      {!open ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Define yes / no
        </Button>
      ) : (
        <div className="space-y-2">
          {(['true', 'false'] as const).map((side) => (
            <div key={side} className="flex items-center gap-2">
              <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{side === 'true' ? 'yes' : 'no'}</span>
              <Input
                value={typeof q.criteria?.[side] === 'string' ? (q.criteria[side] as string) : ''}
                aria-label={`${labelPrefix}what a ${side === 'true' ? 'yes' : 'no'} means`}
                placeholder={`What counts as ${side === 'true' ? 'yes' : 'no'}`}
                onChange={(e) =>
                  onChange({
                    criteria: { true: q.criteria?.true ?? '', false: q.criteria?.false ?? '', [side]: e.target.value },
                  } as Partial<Question>)
                }
                className="flex-1 text-xs"
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ criteria: undefined } as Partial<Question>)
              setOpen(false)
            }}
          >
            Remove criteria
          </Button>
        </div>
      )}
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

function InstructionsField({ q, onChange, label }: { q: Question; onChange: (text: string) => void; label: string }) {
  if (isStructured(q.instructions)) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">instructions</span>
        <StructuredNote value={q.instructions} />
      </div>
    )
  }
  return (
    <Textarea
      value={instructionsString(q)}
      aria-label={label}
      placeholder={TYPE_BLURB[q.type]}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[56px] text-xs"
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

  const [open, setOpen] = React.useState(true)
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
      className={cn('rounded-lg border bg-card p-3 transition-colors duration-fast', selectedQuestion === id ? 'border-brand' : 'border-border')}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${id}` : `Expand ${id}`}
          className="rounded text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <Input
          value={draftId}
          aria-label="Question id"
          aria-invalid={Boolean(idError)}
          onChange={(e) => setDraftId(e.target.value)}
          onBlur={commitId}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onFocus={() => selectQuestion(id)}
          className="h-7 w-44 font-mono text-xs"
        />

        <Chip variant="outline">{TYPE_LABEL[q.type]}</Chip>
        {!open && <span className="text-xs text-muted-foreground">{summarise(q)}</span>}

        <div className="ml-auto flex items-center gap-1">
          {q.type !== 'noul' && (
            <Button variant="ghost" size="sm" onClick={() => (variant ? removeVariant(id) : addVariant(id))}>
              {variant ? 'Remove B' : 'A/B'}
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={`Duplicate ${id}`} onClick={() => duplicateQuestion(id)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`More actions for ${id}`}>
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => moveQuestion(id, -1)}>Move up</DropdownMenuItem>
              <DropdownMenuItem onClick={() => moveQuestion(id, 1)}>Move down</DropdownMenuItem>
              <DropdownMenuItem onClick={() => deleteQuestion(id)}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {idError && (
        <p role="alert" className="mt-1 pl-6 text-xs text-danger-text">
          {idError}
        </p>
      )}

      {open && (
        <div className="mt-3 pl-6">
          <InstructionsField q={q} label={`Instructions for ${id}`} onChange={(text) => updateQuestion(id, { instructions: text })} />
          <p className="mt-1 text-xs text-muted-foreground">The id is never sent to the model, so write the whole question here.</p>

          <QuestionFields q={q} onChange={(patch) => updateQuestion(id, patch)} />

          {variant && (
            <div className="mt-4 rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-medium">
                Variant B &middot; travels in the same request as <span className="font-mono">{id}__B</span>
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
          {error} The form keeps the last valid questions until this is fixed.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          The same questions as the form. Paste a cookbook&rsquo;s questions here; structured
          instructions and criteria are kept as written.
        </p>
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

export function QuestionsList() {
  const { questions, variants, addQuestion } = usePlayground()
  const [view, setView] = React.useState<'form' | 'json'>('form')
  const entries = Object.entries(questions)
  const tokens = entries.reduce(
    (sum, [id, q]) => sum + estimateTokens(q) + (Object.hasOwn(variants, id) ? estimateTokens(variants[id]) : 0),
    0
  )

  return (
    <section className="p-4" aria-labelledby="questions-heading">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="questions-heading" className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          Questions &middot; {entries.length}
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular text-muted-foreground">≈ {tokens.toLocaleString()} tok</span>
          <SegmentedControl value={view} onValueChange={(v) => setView(v as 'form' | 'json')} aria-label="Questions view">
            <SegmentedControlItem value="form">Form</SegmentedControlItem>
            <SegmentedControlItem value="json">JSON</SegmentedControlItem>
          </SegmentedControl>
          {view === 'form' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(['choice', 'score', 'noul'] as QuestionType[]).map((type) => (
                  <DropdownMenuItem key={type} onClick={() => addQuestion(type)}>
                    <span className="font-mono text-xs">{TYPE_LABEL[type]}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{TYPE_BLURB[type]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {view === 'json' ? (
        <QuestionsJson />
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No questions yet. Add a Choice, Score or Noul — they all travel in one request.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map(([id, q]) => (
            <QuestionCard key={id} id={id} q={q} />
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Lints and the run bar
// ---------------------------------------------------------------------------

export function LintBar() {
  const { lints, applyFix, selectQuestion } = usePlayground()
  const all = lints()
  const blocking = all.filter((l) => l.severity === 'block').length
  if (all.length === 0) return null

  return (
    <div className="border-t border-border px-4 py-2">
      {/* Only the summary is live: re-announcing every lint on each keystroke is noise. */}
      <p className="mb-1 text-xs font-medium text-muted-foreground" aria-live="polite">
        Lints &middot; {all.length}
        {blocking > 0 ? ` · ${blocking} blocking` : ''}
      </p>
      <ul className="space-y-1">
        {all.map((lint, i) => (
          <li key={`${lint.id}-${lint.questionId ?? ''}-${i}`} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span
              className={cn(
                'shrink-0 font-medium',
                lint.severity === 'block' ? 'text-danger-text' : lint.severity === 'warn' ? 'text-warning-text' : 'text-muted-foreground'
              )}
              aria-label={lint.severity === 'block' ? 'Blocking' : lint.severity === 'warn' ? 'Warning' : 'Note'}
            >
              {lint.severity === 'block' ? '✕' : lint.severity === 'warn' ? '⚠' : 'ⓘ'}
            </span>
            <span className="text-muted-foreground">{lint.message}</span>
            {lint.fix && (
              <button type="button" onClick={() => applyFix(lint.fix!.kind)} className="rounded text-brand underline-offset-2 hover:underline">
                {lint.fix.label}
              </button>
            )}
            {lint.questionId && (
              <button type="button" onClick={() => selectQuestion(lint.questionId!)} className="rounded text-brand underline-offset-2 hover:underline">
                show
              </button>
            )}
            {lint.learnHref && (
              // A new tab: following it must not throw away the request being edited.
              <a href={lint.learnHref} target="_blank" rel="noopener" className="rounded text-brand underline-offset-2 hover:underline">
                learn why ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RunBar() {
  const { run, running, canRun, questions, variants, compareOn, setCompareOn, model, setModel, lints, stateError, questionsError } =
    usePlayground()
  const mod = useModKey()

  const count = Object.keys(questions).length + Object.keys(variants).length
  const blocked = hasBlockingLint(lints())
  // A shared link or an old run can carry a model the picker does not list;
  // show it rather than display one model while sending another.
  const models: string[] = (KNOWN_MODELS as readonly string[]).includes(model) ? [...KNOWN_MODELS] : [model, ...KNOWN_MODELS]

  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-3">
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Switch checked={compareOn} onCheckedChange={setCompareOn} aria-label="Compare with an LLM" />
        Compare with an LLM
      </label>

      <span className="text-xs text-muted-foreground">
        {count} question{count === 1 ? '' : 's'} in one request
      </span>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        aria-label="Model"
        className="ml-auto h-8 rounded-md border border-input bg-transparent px-2 font-mono text-xs"
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <Button onClick={() => run()} disabled={!canRun()} className="min-w-[96px]">
        {running ? 'Running…' : 'Run'}
        {!running && <Kbd className="ml-2">{mod}↵</Kbd>}
      </Button>

      {(blocked || stateError || questionsError) && (
        <p className="w-full text-xs text-danger-text">
          {stateError
            ? 'Fix the state above before running.'
            : questionsError
              ? 'Fix the questions JSON above before running.'
              : 'Fix the blocking lints above before running.'}
        </p>
      )}
    </div>
  )
}
