'use client'

import { create } from 'zustand'
import type { Answer, JevRequest, Question, QuestionType, RunError, RunResult, State } from './schema'
import { DEFAULT_MODEL, isEditorQuestionId } from './schema'
import { editorRequestHash, moveKey, parseWireId, toWireRequest, uniqueId } from './serialize'
import type { EditorRequest } from './serialize'
import { lintRequest, hasBlockingLint } from './lints'
import type { Lint, LintFixKind } from './lints'
import { applyPolicyPreset, defaultPolicy, reconcilePolicy, renameInPolicy, POLICY_PRESETS } from './policy'
import type { Policy, Rule } from './policy'
import { addToSession, saveRun } from './storage'
import type { CompareRecord, RunRecord } from './storage'

/**
 * One store for the form and the JSON editor.
 *
 * Both views read and write the same object, so they can never disagree; the
 * JSON editor simply replaces the object wholesale once it parses. Unknown
 * fields ride along untouched, so a request pasted from a cookbook survives a
 * round trip through the form.
 */

/** Where a recorded answer came from. Shown with every replay, never hidden. */
export interface Provenance {
  source: string
  model: string
  date: string
  note?: string
}

export interface LastRun {
  answers: Record<string, Answer>
  /** The wire request that produced these answers, for the JSON tab and replay. */
  request: JevRequest
  model: string
  /** Null for a recording that did not publish token counts. */
  usage: { input_tokens: number; output_tokens: number } | null
  /** Null for a replay: nothing was timed, so nothing is shown. */
  timing: { jevMs: number; serverMs: number; retries: number } | null
  clientMs: number | null
  /** Null for a replay: it cost this site nothing, and we will not invent a figure. */
  costUsd: number | null
  replay: boolean
  provenance?: Provenance
  /** Hash of the editor request these answers belong to. */
  hash: string
  compare?: CompareRecord
}

export type StateMode = 'text' | 'json'
export type ResultTab = 'answers' | 'policy' | 'compare' | 'json' | 'code'

interface PlaygroundState {
  // request
  state: State
  stateMode: StateMode
  /** Set while the JSON state editor holds text that does not parse. */
  stateError: string | null
  /** Set while the questions JSON view holds text that does not parse. */
  questionsError: string | null
  model: string
  questions: Record<string, Question>
  variants: Record<string, Question>
  policy: Policy

  // context
  title: string
  presetId: string | null
  variantId: string | null
  baselineHash: string
  /** The preset's recording, kept for when live runs are unavailable. */
  recordedFallback: LastRun | null
  /** A one-line explanation of something the app did on the reader's behalf. */
  notice: string | null

  // run
  running: boolean
  runToken: number
  /**
   * Bumped by every load. Editors holding their own text (the JSON views)
   * resync on it, so a Reset over invalid, uncommitted text cannot leave that
   * text on screen while Run sends the preset.
   */
  loadCount: number
  lastRun: LastRun | null
  error: RunError | null
  compareOn: boolean
  tab: ResultTab
  selectedQuestion: string | null
  announcement: string

  // derived
  lints: () => Lint[]
  canRun: () => boolean
  editorRequest: () => EditorRequest
  wireRequest: () => JevRequest
  isDirtySinceRun: () => boolean

  // state editing
  setState: (state: State) => void
  setStateMode: (mode: StateMode) => void
  setStateError: (error: string | null) => void
  setQuestionsError: (error: string | null) => void
  setModel: (model: string) => void
  setTitle: (title: string) => void

  // question editing
  addQuestion: (type: QuestionType) => string
  updateQuestion: (id: string, patch: Partial<Question>) => void
  /** Returns an error message when the rename was refused, or null. */
  renameQuestion: (from: string, to: string) => string | null
  duplicateQuestion: (id: string) => void
  deleteQuestion: (id: string) => void
  moveQuestion: (id: string, delta: number) => void
  replaceQuestions: (questions: Record<string, Question>) => void

  // A/B
  addVariant: (id: string) => void
  updateVariant: (id: string, patch: Partial<Question>) => void
  removeVariant: (id: string) => void

  // policy
  setPolicy: (policy: Policy) => void
  /** Keyed by the rule's position: one question can carry several rules. */
  updateRule: (index: number, patch: Partial<Rule>) => void
  applyPreset: (key: keyof typeof POLICY_PRESETS) => void

  // lints
  applyFix: (kind: LintFixKind) => void

  // run lifecycle
  run: (opts?: { compare?: boolean; feature?: string }) => Promise<void>
  setCompareOn: (on: boolean) => void
  setTab: (tab: ResultTab) => void
  selectQuestion: (id: string | null) => void
  dismissNotice: () => void

  // loading
  load: (input: LoadInput) => void
  restoreRun: (run: RunRecord) => void
  reset: () => void
}

export interface LoadInput {
  state: State
  stateMode?: StateMode
  model?: string
  questions: Record<string, Question>
  variants?: Record<string, Question>
  policy?: Policy
  title?: string
  presetId?: string | null
  variantId?: string | null
  /** A preset's recorded response, shown before the reader spends anything. */
  recorded?: LastRun | null
  compare?: boolean
  notice?: string | null
}

const BLANK_QUESTION: Record<QuestionType, () => Question> = {
  choice: () => ({
    type: 'choice',
    instructions: '',
    criteria: { option_a: null, option_b: null, other: 'None of the above' },
  }),
  score: () => ({ type: 'score', instructions: '', criteria: ['', '', ''] }),
  noul: () => ({ type: 'noul', instructions: '' }),
}

const EMPTY: LoadInput = { state: '', questions: {}, title: 'Blank request', presetId: null }

/** Errors that mean "live runs are unavailable", not "your request is wrong". */
const UNAVAILABLE = new Set<RunError['error']>(['budget', 'paused', 'counters_unavailable'])

export const usePlayground = create<PlaygroundState>((set, get) => ({
  state: EMPTY.state,
  stateMode: 'text',
  stateError: null,
  questionsError: null,
  model: DEFAULT_MODEL,
  questions: {},
  variants: {},
  policy: { rules: [] },

  title: 'Blank request',
  presetId: null,
  variantId: null,
  baselineHash: '',
  recordedFallback: null,
  notice: null,

  running: false,
  runToken: 0,
  loadCount: 0,
  lastRun: null,
  error: null,
  compareOn: false,
  tab: 'answers',
  selectedQuestion: null,
  announcement: '',

  // --- derived -------------------------------------------------------------

  editorRequest: () => {
    const { state, model, questions, variants } = get()
    return { state, model, questions, variants }
  },

  wireRequest: () => toWireRequest(get().editorRequest()),

  lints: () => {
    const { state, questions, variants } = get()
    return lintRequest(state, questions, variants)
  },

  canRun: () => {
    const { running, questions, stateError, questionsError } = get()
    // A JSON editor with unparsed text must not run: the store still holds the
    // last valid value, so the request would not be what is on screen.
    return (
      !running &&
      !stateError &&
      !questionsError &&
      Object.keys(questions).length > 0 &&
      !hasBlockingLint(get().lints())
    )
  },

  isDirtySinceRun: () => {
    const { lastRun } = get()
    if (!lastRun) return false
    return editorRequestHash(get().editorRequest()) !== lastRun.hash
  },

  // --- state ---------------------------------------------------------------

  setState: (state) => set({ state }),

  /**
   * Text always sends a string; JSON sends the parsed value. Converting says
   * what it did rather than silently changing what the model receives.
   */
  setStateMode: (mode) =>
    set((s) => {
      if (mode === s.stateMode) return {}
      if (mode === 'json' && typeof s.state === 'string') {
        try {
          const parsed = JSON.parse(s.state)
          if (parsed && typeof parsed === 'object') return { stateMode: mode, state: parsed, stateError: null }
        } catch {
          /* not JSON: keep the string, the editor captions why */
        }
        return { stateMode: mode, stateError: null }
      }
      if (mode === 'text' && typeof s.state !== 'string') {
        return { stateMode: mode, state: JSON.stringify(s.state, null, 2), stateError: null }
      }
      return { stateMode: mode, stateError: null }
    }),

  setStateError: (stateError) => set({ stateError }),
  setQuestionsError: (questionsError) => set({ questionsError }),
  setModel: (model) => set({ model }),
  setTitle: (title) => set({ title }),

  // --- questions -----------------------------------------------------------

  addQuestion: (type) => {
    const id = uniqueId(type === 'noul' ? 'is_true' : type, Object.keys(get().questions))
    set((s) => ({
      questions: { ...s.questions, [id]: BLANK_QUESTION[type]() },
      policy: {
        rules: [
          ...s.policy.rules,
          type === 'noul'
            ? { q: id, kind: 'noul' as const, yes: 0.8, no: 0.2 }
            : { q: id, kind: 'band' as const, act: 0.85, review: 0.5 },
        ],
      },
      selectedQuestion: id,
    }))
    return id
  },

  updateQuestion: (id, patch) =>
    set((s) => {
      if (!Object.hasOwn(s.questions, id)) return {}
      return { questions: { ...s.questions, [id]: { ...s.questions[id], ...patch } as Question } }
    }),

  renameQuestion: (from, to) => {
    const s = get()
    if (from === to) return null
    if (!Object.hasOwn(s.questions, from)) return 'That question no longer exists.'
    if (!isEditorQuestionId(to)) {
      return /__[AB]$/.test(to)
        ? 'Ids ending in __A or __B are reserved for A/B variants.'
        : 'Use letters, digits, _ or -, up to 64 characters.'
    }
    if (Object.hasOwn(s.questions, to)) return `"${to}" is already a question here.`

    set({
      questions: Object.fromEntries(Object.entries(s.questions).map(([k, v]) => [k === from ? to : k, v])),
      variants: Object.fromEntries(Object.entries(s.variants).map(([k, v]) => [k === from ? to : k, v])),
      policy: renameInPolicy(s.policy, from, to),
      selectedQuestion: s.selectedQuestion === from ? to : s.selectedQuestion,
    })
    return null
  },

  duplicateQuestion: (id) =>
    set((s) => {
      if (!Object.hasOwn(s.questions, id)) return {}
      const copy = uniqueId(`${id}_copy`, Object.keys(s.questions))
      // Rules are not copied: a duplicate is a new decision, not the same one.
      return {
        questions: { ...s.questions, [copy]: structuredClone(s.questions[id]) },
        selectedQuestion: copy,
      }
    }),

  deleteQuestion: (id) =>
    set((s) => {
      if (!Object.hasOwn(s.questions, id)) return {}
      const questions = { ...s.questions }
      delete questions[id]
      const variants = { ...s.variants }
      delete variants[id]
      return {
        questions,
        variants,
        policy: reconcilePolicy(s.policy, Object.keys(questions)),
        selectedQuestion: s.selectedQuestion === id ? null : s.selectedQuestion,
      }
    }),

  moveQuestion: (id, delta) => set((s) => ({ questions: moveKey(s.questions, id, delta) })),

  replaceQuestions: (questions) =>
    set((s) => ({
      questions,
      variants: Object.fromEntries(Object.entries(s.variants).filter(([id]) => Object.hasOwn(questions, id))),
      policy: reconcilePolicy(s.policy, Object.keys(questions)),
    })),

  // --- A/B -----------------------------------------------------------------

  addVariant: (id) =>
    set((s) => {
      if (!Object.hasOwn(s.questions, id) || Object.hasOwn(s.variants, id)) return {}
      return { variants: { ...s.variants, [id]: structuredClone(s.questions[id]) } }
    }),

  updateVariant: (id, patch) =>
    set((s) => {
      if (!Object.hasOwn(s.variants, id)) return {}
      return { variants: { ...s.variants, [id]: { ...s.variants[id], ...patch } as Question } }
    }),

  removeVariant: (id) =>
    set((s) => {
      const variants = { ...s.variants }
      delete variants[id]
      return { variants }
    }),

  // --- policy --------------------------------------------------------------

  setPolicy: (policy) => set({ policy }),

  updateRule: (index, patch) =>
    set((s) => ({
      policy: { rules: s.policy.rules.map((r, i) => (i === index ? ({ ...r, ...patch } as Rule) : r)) },
    })),

  applyPreset: (key) =>
    set((s) => ({ policy: applyPolicyPreset(s.policy, POLICY_PRESETS[key], s.questions) })),

  // --- lint fixes ----------------------------------------------------------

  applyFix: (kind) =>
    set((s) => {
      if (!Object.hasOwn(s.questions, kind.questionId)) return {}
      const q = s.questions[kind.questionId]

      if (kind.type === 'add-escape-option' && q.type === 'choice') {
        const key = uniqueId('other', Object.keys(q.criteria))
        return {
          questions: {
            ...s.questions,
            [kind.questionId]: { ...q, criteria: { ...q.criteria, [key]: 'None of the above' } },
          },
        }
      }

      if (kind.type === 'trim-levels' && q.type === 'score') {
        return {
          questions: { ...s.questions, [kind.questionId]: { ...q, criteria: q.criteria.slice(0, 10) } },
        }
      }

      return {}
    }),

  // --- running -------------------------------------------------------------

  /**
   * One in-flight run at a time, and a token so a response that lands after
   * the reader has moved on — edited the request, or loaded another preset —
   * is dropped rather than shown as the answer to something it never was.
   */
  run: async (opts = {}) => {
    const s = get()
    if (!s.canRun()) return

    const compare = opts.compare ?? s.compareOn
    const token = s.runToken + 1
    const editor = s.editorRequest()
    const wire = toWireRequest(editor)
    // Snapshot now. Computed after the await, an edit made during the run was
    // silently counted as part of it.
    const hash = editorRequestHash(editor)
    const startedAt = performance.now()

    set({ running: true, runToken: token, error: null, notice: null, announcement: 'Running…' })

    let res: Response
    let body: unknown
    try {
      res = await fetch(compare ? '/api/compare' : '/api/jev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: wire,
          feature: compare ? 'compare' : (opts.feature ?? 'play'),
          presetId: s.presetId ?? undefined,
          variantId: s.variantId ?? undefined,
        }),
      })
      // A proxy timeout can answer with an HTML page; that is not a network error.
      body = await res.json().catch(() => null)
    } catch {
      if (get().runToken !== token) return
      set({
        running: false,
        error: { error: 'network', message: 'Could not reach the server.' },
        announcement: 'Run failed: could not reach the server.',
      })
      return
    }

    if (get().runToken !== token) return // superseded

    if (!res.ok || !body) {
      const error: RunError =
        body && typeof body === 'object' && 'error' in body
          ? (body as RunError)
          : { error: 'upstream', message: `The server answered ${res.status} without an explanation.` }

      // Live runs are unavailable: an unmodified preset can still show what it
      // recorded, labelled as a replay with its source and date.
      const { recordedFallback, baselineHash } = get()
      if (UNAVAILABLE.has(error.error) && recordedFallback && hash === baselineHash) {
        set({
          running: false,
          lastRun: recordedFallback,
          error: null,
          tab: 'answers',
          notice: `${error.message} Showing the answer recorded on ${recordedFallback.provenance?.date ?? 'an earlier date'} instead.`,
          announcement: 'Live runs are unavailable; showing a recorded answer.',
        })
        return
      }

      set({ running: false, error, announcement: `Run failed: ${error.message}` })
      return
    }

    const result = body as RunResult & { compare?: CompareRecord }
    const clientMs = Math.round(performance.now() - startedAt)

    const lastRun: LastRun = {
      answers: result.answers,
      request: wire,
      model: result.model,
      usage: result.usage,
      timing: result.timing,
      clientMs,
      costUsd: result.costUsd,
      replay: false,
      hash,
      compare: result.compare,
    }

    set({
      running: false,
      lastRun,
      error: null,
      tab: compare ? 'compare' : 'answers',
      announcement: `Run complete: ${Object.keys(result.answers).length} answers in ${result.timing.jevMs} ms.`,
    })

    // Storage last and outside the request path: a full or blocked
    // localStorage must never turn a successful run into an error.
    try {
      const record: RunRecord = {
        id: `${Date.now()}-${token}`,
        ts: Date.now(),
        title: s.title,
        presetId: s.presetId ?? undefined,
        variantId: s.variantId ?? undefined,
        request: wire,
        editor: {
          questions: editor.questions,
          variants: editor.variants,
          stateMode: s.stateMode,
          policy: s.policy,
          compare,
        },
        answers: result.answers,
        usage: result.usage,
        timing: result.timing,
        clientMs,
        costUsd: result.costUsd,
        model: result.model,
        replay: false,
        compare: result.compare,
      }
      saveRun(record)
      addToSession(result.usage.input_tokens, result.costUsd + (result.compare?.costUsd ?? 0))
    } catch {
      /* conveniences only */
    }
  },

  setCompareOn: (compareOn) => set({ compareOn }),
  setTab: (tab) => set({ tab }),
  selectQuestion: (selectedQuestion) => set({ selectedQuestion }),
  dismissNotice: () => set({ notice: null }),

  // --- loading -------------------------------------------------------------

  load: (input) => {
    const questions = input.questions
    const variants = input.variants ?? {}
    const policy = input.policy ?? defaultPolicy(questions)
    const model = input.model ?? DEFAULT_MODEL
    const baselineHash = editorRequestHash({ state: input.state, model, questions, variants })

    // A recording belongs to exactly this request, so it is not "changed since run".
    const recorded = input.recorded ? { ...input.recorded, hash: input.recorded.hash || baselineHash } : null

    set((s) => ({
      state: input.state,
      stateMode: input.stateMode ?? (typeof input.state === 'string' ? 'text' : 'json'),
      stateError: null,
      questionsError: null,
      model,
      questions,
      variants,
      policy,
      title: input.title ?? 'Untitled request',
      presetId: input.presetId ?? null,
      variantId: input.variantId ?? null,
      baselineHash,
      recordedFallback: recorded?.replay ? recorded : null,
      notice: input.notice ?? null,
      lastRun: recorded,
      error: null,
      // Bump the token: a run still in flight belongs to the request being
      // replaced, and its answer must not land on this one.
      runToken: s.runToken + 1,
      loadCount: s.loadCount + 1,
      running: false,
      compareOn: input.compare ?? false,
      tab: 'answers',
      selectedQuestion: null,
    }))
  },

  restoreRun: (run) => {
    const editor = run.editor
    get().load({
      state: run.request.state,
      stateMode: editor?.stateMode,
      model: run.request.model,
      // Older records only kept the wire request; rebuild A/B pairs from it.
      ...(editor ? { questions: editor.questions, variants: editor.variants } : unwire(run.request.questions)),
      policy: editor?.policy,
      title: run.title,
      presetId: run.presetId ?? null,
      variantId: run.variantId ?? null,
      compare: editor?.compare,
      notice: run.stateTruncated
        ? 'This run’s state was too large to keep in the browser, so only a placeholder was saved. Paste the original state before running it again.'
        : `Reopened from Recent. These are the answers from ${new Date(run.ts).toLocaleString()}.`,
      recorded: {
        answers: run.answers,
        request: run.request,
        model: run.model,
        usage: run.usage,
        timing: run.timing,
        clientMs: run.clientMs ?? null,
        costUsd: run.costUsd,
        replay: false,
        hash: '',
        compare: run.compare,
      },
    })
    if (run.stateTruncated) set({ stateError: 'The saved state is a placeholder. Paste the original to run again.' })
  },

  reset: () => get().load(EMPTY),
}))

/** Rebuild the editor shape from wire ids: `sev__A` + `sev__B` → question `sev` with a variant. */
function unwire(wire: Record<string, Question>): { questions: Record<string, Question>; variants: Record<string, Question> } {
  const questions: Record<string, Question> = {}
  const variants: Record<string, Question> = {}
  for (const [wireId, q] of Object.entries(wire)) {
    const { baseId, variant } = parseWireId(wireId)
    if (variant === 'A') questions[baseId] = q
    else if (variant === 'B') variants[baseId] = q
    else questions[wireId] = q
  }
  // A B with no A becomes an ordinary question rather than vanishing.
  for (const [id, q] of Object.entries(variants)) {
    if (!Object.hasOwn(questions, id)) {
      questions[id] = q
      delete variants[id]
    }
  }
  return { questions, variants }
}

export interface AnswerGroup {
  id: string
  /** The single answer, or variant A. */
  a?: Answer
  b?: Answer
  /** True when this question was sent as an A/B pair. */
  paired: boolean
}

/** Pairs `severity__A` / `severity__B` answers back into one card, saying so when a half is missing. */
export function groupAnswers(answers: Record<string, Answer>): AnswerGroup[] {
  const groups: AnswerGroup[] = []
  const seen = new Set<string>()

  for (const wireId of Object.keys(answers)) {
    const { baseId, variant } = parseWireId(wireId)
    if (seen.has(baseId)) continue
    seen.add(baseId)

    if (variant) {
      groups.push({
        id: baseId,
        a: Object.hasOwn(answers, `${baseId}__A`) ? answers[`${baseId}__A`] : undefined,
        b: Object.hasOwn(answers, `${baseId}__B`) ? answers[`${baseId}__B`] : undefined,
        paired: true,
      })
    } else {
      groups.push({ id: wireId, a: answers[wireId], paired: false })
    }
  }

  return groups
}
