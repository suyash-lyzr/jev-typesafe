'use client'

import { create } from 'zustand'
import type { Answer, JevRequest, Question, QuestionType, RunError, RunResult, State } from './schema'
import { DEFAULT_MODEL } from './schema'
import { editorRequestHash, moveKey, parseWireId, toWireRequest, uniqueId } from './serialize'
import type { EditorRequest } from './serialize'
import { lintRequest, hasBlockingLint } from './lints'
import type { Lint, LintFixKind } from './lints'
import { defaultPolicy, reconcilePolicy, renameInPolicy } from './policy'
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

export interface LastRun {
  answers: Record<string, Answer>
  /** The wire request that produced these answers, for the JSON tab and replay. */
  request: JevRequest
  model: string
  usage: { input_tokens: number; output_tokens: number }
  timing: { jevMs: number; serverMs: number; retries: number }
  clientMs: number
  costUsd: number
  replay: boolean
  hash: string
  compare?: CompareRecord
}

export type StateMode = 'text' | 'json'
export type ResultTab = 'answers' | 'policy' | 'compare' | 'json' | 'code'

interface PlaygroundState {
  // request
  state: State
  stateMode: StateMode
  model: string
  questions: Record<string, Question>
  variants: Record<string, Question>
  policy: Policy

  // context
  title: string
  presetId: string | null
  variantId: string | null
  baselineHash: string

  // run
  running: boolean
  runToken: number
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
  setModel: (model: string) => void
  setTitle: (title: string) => void

  // question editing
  addQuestion: (type: QuestionType) => string
  updateQuestion: (id: string, patch: Partial<Question>) => void
  renameQuestion: (from: string, to: string) => void
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
  updateRule: (questionId: string, patch: Partial<Rule>) => void

  // lints
  applyFix: (kind: LintFixKind) => void

  // run lifecycle
  run: (opts?: { compare?: boolean; feature?: string }) => Promise<void>
  setCompareOn: (on: boolean) => void
  setTab: (tab: ResultTab) => void
  selectQuestion: (id: string | null) => void

  // loading
  load: (input: LoadInput) => void
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

const EMPTY: LoadInput = {
  state: '',
  questions: {},
  title: 'Blank request',
  presetId: null,
}

export const usePlayground = create<PlaygroundState>((set, get) => ({
  state: EMPTY.state,
  stateMode: 'text',
  model: DEFAULT_MODEL,
  questions: {},
  variants: {},
  policy: { rules: [] },

  title: 'Blank request',
  presetId: null,
  variantId: null,
  baselineHash: '',

  running: false,
  runToken: 0,
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
    const { running, questions } = get()
    return !running && Object.keys(questions).length > 0 && !hasBlockingLint(get().lints())
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
          if (parsed && typeof parsed === 'object') return { stateMode: mode, state: parsed }
        } catch {
          /* not JSON: keep the string, the editor captions why */
        }
        return { stateMode: mode }
      }
      if (mode === 'text' && typeof s.state !== 'string') {
        return { stateMode: mode, state: JSON.stringify(s.state, null, 2) }
      }
      return { stateMode: mode }
    }),

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
      const current = s.questions[id]
      if (!current) return {}
      return { questions: { ...s.questions, [id]: { ...current, ...patch } as Question } }
    }),

  renameQuestion: (from, to) =>
    set((s) => {
      if (from === to || !s.questions[from] || s.questions[to]) return {}
      const questions = Object.fromEntries(
        Object.entries(s.questions).map(([k, v]) => [k === from ? to : k, v])
      )
      const variants = Object.fromEntries(
        Object.entries(s.variants).map(([k, v]) => [k === from ? to : k, v])
      )
      return {
        questions,
        variants,
        policy: renameInPolicy(s.policy, from, to),
        selectedQuestion: s.selectedQuestion === from ? to : s.selectedQuestion,
      }
    }),

  duplicateQuestion: (id) =>
    set((s) => {
      const source = s.questions[id]
      if (!source) return {}
      const copy = uniqueId(`${id}_copy`, Object.keys(s.questions))
      // Rules are not copied: a duplicate is a new decision, not the same one.
      return {
        questions: { ...s.questions, [copy]: structuredClone(source) },
        selectedQuestion: copy,
      }
    }),

  deleteQuestion: (id) =>
    set((s) => {
      const { [id]: _removed, ...questions } = s.questions
      const { [id]: _variant, ...variants } = s.variants
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
      variants: Object.fromEntries(
        Object.entries(s.variants).filter(([id]) => id in questions)
      ),
      policy: reconcilePolicy(s.policy, Object.keys(questions)),
    })),

  // --- A/B -----------------------------------------------------------------

  addVariant: (id) =>
    set((s) => {
      const source = s.questions[id]
      if (!source || s.variants[id]) return {}
      return { variants: { ...s.variants, [id]: structuredClone(source) } }
    }),

  updateVariant: (id, patch) =>
    set((s) => {
      const current = s.variants[id]
      if (!current) return {}
      return { variants: { ...s.variants, [id]: { ...current, ...patch } as Question } }
    }),

  removeVariant: (id) =>
    set((s) => {
      const { [id]: _removed, ...variants } = s.variants
      return { variants }
    }),

  // --- policy --------------------------------------------------------------

  setPolicy: (policy) => set({ policy }),

  updateRule: (questionId, patch) =>
    set((s) => ({
      policy: {
        rules: s.policy.rules.map((r) => (r.q === questionId ? ({ ...r, ...patch } as Rule) : r)),
      },
    })),

  // --- lint fixes ----------------------------------------------------------

  applyFix: (kind) =>
    set((s) => {
      const q = s.questions[kind.questionId]
      if (!q) return {}

      if (kind.type === 'add-escape-option' && q.type === 'choice') {
        return {
          questions: {
            ...s.questions,
            [kind.questionId]: {
              ...q,
              criteria: { ...q.criteria, other: 'None of the above' },
            },
          },
        }
      }

      if (kind.type === 'trim-levels' && q.type === 'score') {
        return {
          questions: {
            ...s.questions,
            [kind.questionId]: { ...q, criteria: q.criteria.slice(0, 10) },
          },
        }
      }

      return {}
    }),

  // --- running -------------------------------------------------------------

  /**
   * One in-flight run at a time, and a token so a slow response that lands
   * after the reader has moved on is dropped rather than overwriting.
   */
  run: async (opts = {}) => {
    const s = get()
    if (s.running || !s.canRun()) return

    const compare = opts.compare ?? s.compareOn
    const token = s.runToken + 1
    const wire = s.wireRequest()
    const startedAt = performance.now()

    set({ running: true, runToken: token, error: null, announcement: 'Running…' })

    try {
      const res = await fetch(compare ? '/api/compare' : '/api/jev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: wire,
          feature: compare ? 'compare' : (opts.feature ?? 'play'),
          presetId: s.presetId ?? undefined,
          variantId: s.variantId ?? undefined,
        }),
      })

      const body = await res.json()
      if (get().runToken !== token) return // superseded

      if (!res.ok) {
        set({
          running: false,
          error: body as RunError,
          announcement: `Run failed: ${(body as RunError).message}`,
        })
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
        replay: result.replay,
        hash: editorRequestHash(s.editorRequest()),
        compare: result.compare,
      }

      set({
        running: false,
        lastRun,
        error: null,
        tab: compare ? 'compare' : 'answers',
        announcement: `Run complete: ${Object.keys(result.answers).length} answers in ${result.timing.jevMs} ms.`,
      })

      const record: RunRecord = {
        id: `${Date.now()}-${token}`,
        ts: Date.now(),
        title: s.title,
        presetId: s.presetId ?? undefined,
        variantId: s.variantId ?? undefined,
        request: wire,
        answers: result.answers,
        usage: result.usage,
        timing: result.timing,
        costUsd: result.costUsd,
        model: result.model,
        replay: result.replay,
        compare: result.compare,
      }
      saveRun(record)
      addToSession(result.usage.input_tokens, result.costUsd + (result.compare?.costUsd ?? 0))
    } catch {
      if (get().runToken !== token) return
      set({
        running: false,
        error: { error: 'network', message: 'Could not reach the server.' },
        announcement: 'Run failed: could not reach the server.',
      })
    }
  },

  setCompareOn: (compareOn) => set({ compareOn }),
  setTab: (tab) => set({ tab }),
  selectQuestion: (selectedQuestion) => set({ selectedQuestion }),

  // --- loading -------------------------------------------------------------

  load: (input) => {
    const questions = input.questions
    const variants = input.variants ?? {}
    const policy = input.policy ?? defaultPolicy(questions)
    const editor: EditorRequest = {
      state: input.state,
      model: input.model ?? DEFAULT_MODEL,
      questions,
      variants,
    }

    set({
      state: input.state,
      stateMode: input.stateMode ?? (typeof input.state === 'string' ? 'text' : 'json'),
      model: input.model ?? DEFAULT_MODEL,
      questions,
      variants,
      policy,
      title: input.title ?? 'Untitled request',
      presetId: input.presetId ?? null,
      variantId: input.variantId ?? null,
      baselineHash: editorRequestHash(editor),
      lastRun: input.recorded ?? null,
      error: null,
      running: false,
      compareOn: input.compare ?? false,
      tab: 'answers',
      selectedQuestion: null,
    })
  },

  reset: () => get().load(EMPTY),
}))

/** Pairs `severity__A` / `severity__B` answers back into one card. */
export function groupAnswers(answers: Record<string, Answer>): Array<{
  id: string
  a: Answer
  b?: Answer
}> {
  const groups: Array<{ id: string; a: Answer; b?: Answer }> = []
  const seen = new Set<string>()

  for (const [wireId, answer] of Object.entries(answers)) {
    const { baseId, variant } = parseWireId(wireId)
    if (seen.has(baseId)) continue

    if (variant === 'A' || variant === 'B') {
      seen.add(baseId)
      groups.push({
        id: baseId,
        a: answers[`${baseId}__A`] ?? answer,
        b: answers[`${baseId}__B`],
      })
    } else {
      seen.add(wireId)
      groups.push({ id: wireId, a: answer })
    }
  }

  return groups
}
