import { z } from 'zod'

/**
 * The TypeSafe System One contract, mirrored exactly.
 * Source: docs.typesafe.ai/api, /primitives/{choice,score,noul}, /models.
 *
 * This module is imported by both the browser (form, JSON editor, lints) and
 * the server proxy, so a request that passes here passes in both places.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Options per Choice. 255 is the API's hard cap (256 → 400 "Too many choices");
 * the docs call it reliable to ~240.
 *
 * The API *accepts* a single-option Choice and returns it at probability 1.0
 * (verified — see content/recorded/errors/choice-one-option.json), so asking
 * for two is advice, not a rule. It lives in the linter, not the schema:
 * we never block a request TypeSafe would have answered.
 */
export const MAX_CHOICE_OPTIONS = 255
export const ADVISED_MIN_CHOICE_OPTIONS = 2

/**
 * Levels per Score. 11 → 400 "Too many score levels. Must have at most 10."
 * A 1-level Score is likewise accepted (returns 0.0 at confidence 1.0), so the
 * docs' "should have at least two levels" is a lint, not a hard minimum.
 */
export const MAX_SCORE_LEVELS = 10
export const ADVISED_MIN_SCORE_LEVELS = 2

/**
 * Questions per request. TypeSafe imposes no count limit — the 64k token
 * budget is the real bound — but a cap keeps the UI and the bill sane.
 * Set above the 54 the function-calling cookbook sends in one call.
 */
export const MAX_QUESTIONS = 100

/** state + longest question must fit 32k tokens; the whole request 64k. */
export const MAX_STATE_CHARS = 32_000
export const MAX_BODY_BYTES = 96_000
export const TOKEN_BUDGET_TOTAL = 64_000
export const TOKEN_BUDGET_STATE = 32_000

/** Question ids are ours, never sent to the model. Case-sensitive, shared by client and server. */
export const QUESTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** The A/B mechanism appends __A / __B on the wire. */
export const WIRE_QUESTION_ID_RE = /^[A-Za-z0-9_-]{1,64}(__[AB])?$/

/**
 * An id the editor will accept. The `__A` / `__B` suffixes are reserved for
 * the A/B mechanism on the wire: a question named `sev__A` would silently
 * replace the A side of a question called `sev`.
 */
/** Ids that would collide with Object.prototype when used as plain-object keys. */
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype'])

export function isEditorQuestionId(id: string): boolean {
  return QUESTION_ID_RE.test(id) && !/__[AB]$/.test(id) && !RESERVED_IDS.has(id)
}

export const EditorQuestionId = z.string().refine(isEditorQuestionId, {
  message: 'Use letters, digits, _ or -, up to 64 characters, not ending in __A or __B, and not __proto__, constructor or prototype.',
})

/** Aliases move; versioned ids are accepted whether or not /v1/models lists them. */
export const MODEL_RE = /^jev-[a-z0-9.\-]{1,32}$/
export const DEFAULT_MODEL = 'jev-latest'

/**
 * The model ids offered in the picker. Any `jev-*` id may be sent to
 * /api/jev — an unknown one is rejected by TypeSafe in milliseconds and costs
 * nothing — but a comparison also spends on OpenAI, so it only accepts these.
 */
export const KNOWN_MODELS = ['jev-latest', 'jev-1.13.0', 'jev-preview'] as const
export const COMPARE_MODELS: readonly string[] = KNOWN_MODELS

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * instructions and every criteria description accept a string, object, array
 * or null. Structured objects ({ what, not_for, examples }) sharpen the
 * boundary between options the model keeps confusing.
 */
export const Description: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.record(z.unknown()), z.array(z.unknown()), z.null()])
)

/** instructions may be structured but must carry something. */
const Instructions = Description.refine((v) => v !== null && v !== undefined, {
  message: 'instructions is required',
}).refine((v) => (typeof v === 'string' ? v.trim().length > 0 : true), {
  message: 'instructions cannot be empty',
})

export const ChoiceQuestion = z.object({
  type: z.literal('choice'),
  instructions: Instructions,
  criteria: z
    .record(z.string().min(1).max(64), Description)
    .refine((c) => Object.keys(c).length >= 1, { message: 'a Choice needs at least one option' })
    .refine((c) => Object.keys(c).length <= MAX_CHOICE_OPTIONS, {
      message: `Too many choices. Must have at most ${MAX_CHOICE_OPTIONS} choices.`,
    }),
})

export const ScoreQuestion = z.object({
  type: z.literal('score'),
  instructions: Instructions,
  criteria: z
    .array(Description.refine((v) => v !== null, { message: 'a level needs a description' }))
    .min(1, 'a Score needs at least one level')
    .max(MAX_SCORE_LEVELS, `Too many score levels. Must have at most ${MAX_SCORE_LEVELS} levels.`),
})

/**
 * A Noul needs instructions OR criteria — the API's own words are
 * "Noul question must have criteria or instructions", so a Noul defined purely
 * by its true/false descriptions is valid. The either/or is enforced on the
 * union below, since a refined object cannot sit in a discriminated union.
 */
export const NoulQuestion = z.object({
  type: z.literal('noul'),
  instructions: Description.optional(),
  criteria: z.object({ true: Description, false: Description }).optional(),
})

export function noulHasContent(q: { instructions?: unknown; criteria?: unknown }): boolean {
  const hasInstructions =
    q.instructions != null &&
    (typeof q.instructions !== 'string' || q.instructions.trim().length > 0)
  return hasInstructions || q.criteria != null
}

export const Question = z
  .discriminatedUnion('type', [ChoiceQuestion, ScoreQuestion, NoulQuestion])
  .superRefine((q, ctx) => {
    if (q.type === 'noul' && !noulHasContent(q)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Noul question must have criteria or instructions',
        path: ['instructions'],
      })
    }
  })

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** A string, JSON object, or array of text values. No images, audio or video. */
export const State = z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())])

export const JevRequest = z.object({
  state: State,
  model: z.string().regex(MODEL_RE).default(DEFAULT_MODEL),
  questions: z
    .record(z.string().regex(WIRE_QUESTION_ID_RE), Question)
    .refine((q) => Object.keys(q).length >= 1, { message: 'ask at least one question' })
    .refine((q) => Object.keys(q).length <= MAX_QUESTIONS, {
      message: `Jev Lab caps requests at ${MAX_QUESTIONS} questions; TypeSafe's limit is the 64k token budget`,
    }),
})

/** What the browser posts to our own proxy. presetId/variantId are for logging only. */
export const ProxyEnvelope = z.object({
  request: JevRequest,
  feature: z.enum(['play', 'landing', 'lesson', 'limits', 'compare']).default('play'),
  presetId: z.string().max(64).optional(),
  variantId: z.string().max(64).optional(),
})

export const CompareEnvelope = ProxyEnvelope.extend({
  feature: z.literal('compare').default('compare'),
  /** One of LLM_MODELS; the server refuses anything else. Omitted = the default. */
  llmModel: z.string().max(64).optional(),
})

// ---------------------------------------------------------------------------
// Answers (mirror the API response)
// ---------------------------------------------------------------------------

export const ChoiceAnswer = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: z.record(z.number()),
  confidence: z.number(),
})

export const ScoreAnswer = z.object({
  type: z.literal('score'),
  score: z.number(),
  /** Level number -> its description. Keyed by string in the HTTP API. */
  legend: z.record(z.unknown()).optional(),
  probabilities: z.record(z.number()),
  confidence: z.number(),
})

/** A Noul carries no confidence: two outcomes, so the single value is the whole answer. */
export const NoulAnswer = z.object({
  type: z.literal('noul'),
  noul: z.number(),
})

export const Answer = z.discriminatedUnion('type', [ChoiceAnswer, ScoreAnswer, NoulAnswer])

export const Usage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
})

export const JevResponse = z.object({
  model: z.string(),
  answers: z.record(Answer),
  usage: Usage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChoiceQuestion = z.infer<typeof ChoiceQuestion>
export type ScoreQuestion = z.infer<typeof ScoreQuestion>
export type NoulQuestion = z.infer<typeof NoulQuestion>
export type Question = z.infer<typeof Question>
export type QuestionType = Question['type']
export type State = z.infer<typeof State>
export type JevRequest = z.infer<typeof JevRequest>
export type ProxyEnvelope = z.infer<typeof ProxyEnvelope>
export type ChoiceAnswer = z.infer<typeof ChoiceAnswer>
export type ScoreAnswer = z.infer<typeof ScoreAnswer>
export type NoulAnswer = z.infer<typeof NoulAnswer>
export type Answer = z.infer<typeof Answer>
export type Usage = z.infer<typeof Usage>
export type JevResponse = z.infer<typeof JevResponse>

/** What our proxy returns on success. */
export interface RunResult {
  model: string
  answers: Record<string, Answer>
  usage: Usage
  timing: { jevMs: number; serverMs: number; retries: number }
  costUsd: number
  replay: boolean
}

/** Normalised failure. `raw` carries TypeSafe's body through for the JSON tab. */
export interface RunError {
  error:
    | 'validation'
    | 'rate_limited'
    | 'budget'
    | 'origin'
    | 'paused'
    | 'counters_unavailable'
    | 'upstream_auth'
    | 'upstream_timeout'
    | 'upstream'
    | 'network'
  message: string
  /** Dotted path to the offending field when the upstream names one. */
  path?: string[]
  retryAfterSec?: number
  scope?: 'minute' | 'day' | 'budget' | 'global' | 'quota'
  resetsAt?: string
  retries?: number
  raw?: unknown
  /** Comparison quota after this request (only on /api/compare responses). */
  quota?: CompareQuota
}

/** A network's free comparisons for the current UTC day. */
export interface CompareQuota {
  limit: number
  used: number
  remaining: number
  resetsAt: string
  /** The owner pass is set: no daily limit for this browser. */
  owner?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rough token estimate for the editor's live readout. Always shown with a ≈. */
/**
 * A deliberately low estimate (characters ÷ 4). Used only where an estimate
 * decides whether to *block* a request, so a borderline valid one is never
 * refused here; TypeSafe has the final say. Not for display.
 */
export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : (JSON.stringify(value ?? '') ?? '')
  return Math.ceil(text.length / 4)
}

/**
 * What Jev actually bills, approximated. Fitted on 2026-09-22 against 71 of
 * our recorded responses (input_tokens vs the characters sent): about 0.38
 * tokens per character of state and questions, plus about 180 tokens of fixed
 * overhead per request. Median error 6%, 90th percentile 14%.
 */
export const TOKENS_PER_CHAR = 0.38
export const REQUEST_OVERHEAD_TOKENS = 180

export function approxTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : (JSON.stringify(value ?? '') ?? '')
  return Math.round(text.length * TOKENS_PER_CHAR)
}

/** The whole request, as Jev will count it: state + questions + fixed overhead. */
export function approxRequestTokens(state: unknown, questions: unknown): number {
  return approxTokens(state) + approxTokens(questions) + REQUEST_OVERHEAD_TOKENS
}

export function stateChars(state: State): number {
  return typeof state === 'string' ? state.length : JSON.stringify(state).length
}

export function isChoice(q: Question): q is ChoiceQuestion {
  return q.type === 'choice'
}
export function isScore(q: Question): q is ScoreQuestion {
  return q.type === 'score'
}
export function isNoul(q: Question): q is NoulQuestion {
  return q.type === 'noul'
}
