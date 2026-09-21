'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, Copy, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Kbd } from '@/components/ui/kbd'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePlayground } from '@/lib/store'
import { estimateTokens, MAX_SCORE_LEVELS, type Question, type QuestionType } from '@/lib/schema'
import { hasBlockingLint } from '@/lib/lints'

/**
 * The left-hand pane: the state, the questions, and everything that stops a
 * request from being worth less than it could be.
 */

const TYPE_LABEL: Record<QuestionType, string> = {
  choice: 'CHOICE',
  score: 'SCORE',
  noul: 'NOUL',
}

const TYPE_BLURB: Record<QuestionType, string> = {
  choice: 'Pick one of a fixed set of options',
  score: 'Place the state on ordered levels',
  noul: 'The probability a statement is true',
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function StateEditor() {
  const { state, stateMode, setState, setStateMode, lastRun, isDirtySinceRun } = usePlayground()
  const [jsonText, setJsonText] = React.useState(() =>
    typeof state === 'string' ? state : JSON.stringify(state, null, 2)
  )
  const [jsonError, setJsonError] = React.useState<string | null>(null)

  // Follow the store when a preset or shared link replaces the state.
  React.useEffect(() => {
    setJsonText(typeof state === 'string' ? state : JSON.stringify(state, null, 2))
    setJsonError(null)
  }, [state])

  const tokens = estimateTokens(state)
  const showLiveTokens = !lastRun || isDirtySinceRun()
  const notJsonInJsonMode = stateMode === 'json' && typeof state === 'string'

  return (
    <section className="border-b border-border p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          State
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular text-muted-foreground">
            {showLiveTokens ? `≈ ${tokens.toLocaleString()} tok` : `${lastRun!.usage.input_tokens} tok`}
          </span>
          <SegmentedControl
            value={stateMode}
            onValueChange={(v) => setStateMode(v as 'text' | 'json')}
          >
            <SegmentedControlItem value="text">Text</SegmentedControlItem>
            <SegmentedControlItem value="json">JSON</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </header>

      <Textarea
        value={jsonText}
        aria-label="State"
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value
          setJsonText(next)

          if (stateMode === 'text') {
            setState(next)
            setJsonError(null)
            return
          }
          try {
            setState(JSON.parse(next))
            setJsonError(null)
          } catch (err) {
            setJsonError(err instanceof Error ? err.message : 'Invalid JSON')
          }
        }}
        className={cn(
          'min-h-[140px] resize-y',
          stateMode === 'json' && 'font-mono text-[13px] leading-relaxed'
        )}
        placeholder={
          stateMode === 'json'
            ? '{\n  "ticket": { "message": "…" }\n}'
            : 'Paste the text you want Jev to read…'
        }
      />

      {jsonError && (
        <p className="mt-1 rounded bg-danger-soft px-2 py-1 font-mono text-xs text-danger-text">
          {jsonError}
        </p>
      )}

      {notJsonInJsonMode && !jsonError && (
        <p className="mt-1 text-xs text-muted-foreground">Not JSON, so it is sent as a string.</p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Sample or synthetic text only. Don&rsquo;t paste API keys, passwords, personal data or
        confidential customer content. Your state is sent to TypeSafe through Lyzr&rsquo;s server
        and is not stored there.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Questions
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

function ChoiceEditor({ id, q }: { id: string; q: Extract<Question, { type: 'choice' }> }) {
  const { updateQuestion } = usePlayground()
  const entries = Object.entries(q.criteria)

  const setOption = (index: number, key: string, description: string | null) => {
    const next = entries.map(([k, v], i) => (i === index ? [key, description] : [k, v]))
    updateQuestion(id, { criteria: Object.fromEntries(next) } as Partial<Question>)
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Options ({entries.length} of 255) &middot; key &middot; description
      </p>
      <div className="space-y-1.5">
        {entries.map(([key, description], i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={key}
              aria-label={`Option ${i + 1} key`}
              onChange={(e) => setOption(i, e.target.value, description as string | null)}
              className="w-40 shrink-0 font-mono text-xs"
            />
            <Input
              value={typeof description === 'string' ? description : description == null ? '' : JSON.stringify(description)}
              aria-label={`Option ${i + 1} description`}
              placeholder="What this option covers (optional)"
              onChange={(e) => setOption(i, key, e.target.value || null)}
              className="flex-1 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove option ${key}`}
              onClick={() => {
                const next = entries.filter((_, index) => index !== i)
                updateQuestion(id, { criteria: Object.fromEntries(next) } as Partial<Question>)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() =>
          updateQuestion(id, {
            criteria: { ...q.criteria, [`option_${entries.length + 1}`]: null },
          } as Partial<Question>)
        }
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

function ScoreEditor({ id, q }: { id: string; q: Extract<Question, { type: 'score' }> }) {
  const { updateQuestion } = usePlayground()
  const levels = q.criteria

  const setLevel = (index: number, text: string) =>
    updateQuestion(id, {
      criteria: levels.map((l, i) => (i === index ? text : l)),
    } as Partial<Question>)

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Levels, low to high ({levels.length} of {MAX_SCORE_LEVELS})
      </p>
      <div className="space-y-1.5">
        {levels.map((level, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i}</span>
            <Input
              value={typeof level === 'string' ? level : JSON.stringify(level)}
              aria-label={`Level ${i}`}
              placeholder="Describe the situation at this level"
              onChange={(e) => setLevel(i, e.target.value)}
              className="flex-1 text-xs"
            />
            <div className="flex shrink-0">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move level ${i} up`}
                disabled={i === 0}
                onClick={() => {
                  const next = [...levels]
                  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                  updateQuestion(id, { criteria: next } as Partial<Question>)
                }}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move level ${i} down`}
                disabled={i === levels.length - 1}
                onClick={() => {
                  const next = [...levels]
                  ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                  updateQuestion(id, { criteria: next } as Partial<Question>)
                }}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove level ${i}`}
                onClick={() =>
                  updateQuestion(id, {
                    criteria: levels.filter((_, index) => index !== i),
                  } as Partial<Question>)
                }
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
        onClick={() => updateQuestion(id, { criteria: [...levels, ''] } as Partial<Question>)}
      >
        <Plus className="mr-1 h-3 w-3" /> level
      </Button>
      {levels.length >= MAX_SCORE_LEVELS && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          The API accepts 2–10 levels; an eleventh is rejected.
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Describe situations, not degrees. Each level is judged on its own, so &ldquo;worse than the
        one before&rdquo; means nothing to the model.
      </p>
    </div>
  )
}

function NoulEditor({ id, q }: { id: string; q: Extract<Question, { type: 'noul' }> }) {
  const { updateQuestion } = usePlayground()
  const [open, setOpen] = React.useState(Boolean(q.criteria))

  return (
    <div className="mt-3">
      {!open ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Define yes / no
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">yes</span>
            <Input
              value={typeof q.criteria?.true === 'string' ? q.criteria.true : ''}
              aria-label="What a yes means"
              placeholder="What counts as yes"
              onChange={(e) =>
                updateQuestion(id, {
                  criteria: { true: e.target.value, false: q.criteria?.false ?? '' },
                } as Partial<Question>)
              }
              className="flex-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">no</span>
            <Input
              value={typeof q.criteria?.false === 'string' ? q.criteria.false : ''}
              aria-label="What a no means"
              placeholder="What counts as no"
              onChange={(e) =>
                updateQuestion(id, {
                  criteria: { true: q.criteria?.true ?? '', false: e.target.value },
                } as Partial<Question>)
              }
              className="flex-1 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              updateQuestion(id, { criteria: undefined } as Partial<Question>)
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

function QuestionCard({ id, q }: { id: string; q: Question }) {
  const {
    updateQuestion,
    renameQuestion,
    duplicateQuestion,
    deleteQuestion,
    moveQuestion,
    addVariant,
    removeVariant,
    variants,
    selectedQuestion,
    selectQuestion,
  } = usePlayground()

  const [open, setOpen] = React.useState(true)
  const [draftId, setDraftId] = React.useState(id)
  React.useEffect(() => setDraftId(id), [id])

  const hasVariant = Boolean(variants[id])

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors duration-fast',
        selectedQuestion === id ? 'border-brand' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${id}` : `Expand ${id}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <Input
          value={draftId}
          aria-label="Question id"
          onChange={(e) => setDraftId(e.target.value)}
          onBlur={() => draftId !== id && renameQuestion(id, draftId)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onFocus={() => selectQuestion(id)}
          className="h-7 w-44 font-mono text-xs"
        />

        <Chip variant="outline">{TYPE_LABEL[q.type]}</Chip>
        {!open && <span className="text-xs text-muted-foreground">{summarise(q)}</span>}

        <div className="ml-auto flex items-center gap-1">
          {q.type !== 'noul' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (hasVariant ? removeVariant(id) : addVariant(id))}
            >
              {hasVariant ? 'Remove B' : 'A/B'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Duplicate ${id}`}
            onClick={() => duplicateQuestion(id)}
          >
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

      {open && (
        <div className="mt-3 pl-6">
          <Textarea
            value={instructionsString(q)}
            aria-label={`Instructions for ${id}`}
            placeholder={TYPE_BLURB[q.type]}
            onChange={(e) => updateQuestion(id, { instructions: e.target.value })}
            className="min-h-[56px] text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The id is never sent to the model, so write the whole question here.
          </p>

          {q.type === 'choice' && <ChoiceEditor id={id} q={q} />}
          {q.type === 'score' && <ScoreEditor id={id} q={q} />}
          {q.type === 'noul' && <NoulEditor id={id} q={q} />}

          {hasVariant && (
            <div className="mt-4 rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-medium">
                Variant B &middot; travels in the same request as{' '}
                <span className="font-mono">{id}__B</span>
              </p>
              <VariantEditor id={id} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VariantEditor({ id }: { id: string }) {
  const { variants, updateVariant } = usePlayground()
  const q = variants[id]
  if (!q) return null

  return (
    <div>
      <Textarea
        value={instructionsString(q)}
        aria-label={`Variant B instructions for ${id}`}
        onChange={(e) => updateVariant(id, { instructions: e.target.value })}
        className="min-h-[48px] text-xs"
      />
      {q.type === 'score' && (
        <div className="mt-2 space-y-1.5">
          {q.criteria.map((level, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i}</span>
              <Input
                value={typeof level === 'string' ? level : JSON.stringify(level)}
                aria-label={`Variant B level ${i}`}
                onChange={(e) =>
                  updateVariant(id, {
                    criteria: q.criteria.map((l, index) => (index === i ? e.target.value : l)),
                  } as Partial<Question>)
                }
                className="flex-1 text-xs"
              />
            </div>
          ))}
        </div>
      )}
      {q.type === 'choice' && (
        <div className="mt-2 space-y-1.5">
          {Object.entries(q.criteria).map(([key, description], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={key}
                aria-label={`Variant B option ${i + 1} key`}
                onChange={(e) => {
                  const entries = Object.entries(q.criteria)
                  entries[i] = [e.target.value, description]
                  updateVariant(id, { criteria: Object.fromEntries(entries) } as Partial<Question>)
                }}
                className="w-36 shrink-0 font-mono text-xs"
              />
              <Input
                value={typeof description === 'string' ? description : ''}
                aria-label={`Variant B option ${i + 1} description`}
                onChange={(e) => {
                  const entries = Object.entries(q.criteria)
                  entries[i] = [key, e.target.value || null]
                  updateVariant(id, { criteria: Object.fromEntries(entries) } as Partial<Question>)
                }}
                className="flex-1 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function QuestionsList() {
  const { questions, variants, addQuestion } = usePlayground()
  const entries = Object.entries(questions)
  const tokens = entries.reduce(
    (sum, [id, q]) => sum + estimateTokens(q) + (variants[id] ? estimateTokens(variants[id]) : 0),
    0
  )

  return (
    <section className="p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          Questions &middot; {entries.length}
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular text-muted-foreground">
            ≈ {tokens.toLocaleString()} tok
          </span>
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
        </div>
      </header>

      {entries.length === 0 ? (
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
  if (all.length === 0) return null

  return (
    <div className="border-t border-border px-4 py-2" aria-live="polite">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Lints &middot; {all.length}
      </p>
      <ul className="space-y-1">
        {all.map((lint, i) => (
          <li key={`${lint.id}-${i}`} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span
              className={cn(
                'shrink-0 font-medium',
                lint.severity === 'block'
                  ? 'text-danger-text'
                  : lint.severity === 'warn'
                    ? 'text-warning-text'
                    : 'text-muted-foreground'
              )}
            >
              {lint.severity === 'block' ? '✕' : lint.severity === 'warn' ? '⚠' : 'ⓘ'}
            </span>
            <span className="text-muted-foreground">{lint.message}</span>
            {lint.fix && (
              <button
                type="button"
                onClick={() => applyFix(lint.fix!.kind)}
                className="text-brand underline-offset-2 hover:underline"
              >
                {lint.fix.label}
              </button>
            )}
            {lint.questionId && (
              <button
                type="button"
                onClick={() => selectQuestion(lint.questionId!)}
                className="text-brand underline-offset-2 hover:underline"
              >
                show
              </button>
            )}
            {lint.learnHref && (
              <a href={lint.learnHref} className="text-brand underline-offset-2 hover:underline">
                learn why
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RunBar() {
  const { run, running, canRun, questions, variants, compareOn, setCompareOn, model, setModel, lints } =
    usePlayground()

  const count = Object.keys(questions).length + Object.keys(variants).length
  const blocked = hasBlockingLint(lints())

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
        <option value="jev-latest">jev-latest</option>
        <option value="jev-1.13.0">jev-1.13.0</option>
        <option value="jev-preview">jev-preview</option>
      </select>

      <Button onClick={() => run()} disabled={!canRun()} className="min-w-[96px]">
        {running ? 'Running…' : 'Run'}
        {!running && <Kbd className="ml-2">⌘↵</Kbd>}
      </Button>

      {blocked && (
        <p className="w-full text-xs text-danger-text">
          Fix the blocking lints above before running.
        </p>
      )}
    </div>
  )
}
