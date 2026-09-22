import 'server-only'
import type { JevRequest, Question } from './schema'
import type { LlmPricing } from './pricing'
import { OPENAI_MAX_OUTPUT_TOKENS } from './guards'
import { findLlmModel } from './llm-models'

/**
 * The LLM side of the comparison.
 *
 * Fairness is the whole point, so a few choices are deliberate and are stated
 * on /compare rather than buried here:
 *
 *  - The LLM gets its fastest reasoning setting, not one chosen to make it look
 *    slow. Which value that is depends on the model generation, so it is
 *    configurable; a model that rejects the parameter is retried once without
 *    it, and only the attempt that succeeded is timed.
 *  - Retries for errors are off, so a transient 5xx cannot quietly inflate its
 *    latency.
 *  - We never ask it for a "confidence". A number a model writes in its JSON is
 *    not a distribution it computed.
 *  - Both sides are timed the same way: the network call plus reading the body.
 *  - Output is capped, so a runaway completion cannot outspend the reservation.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Structured Outputs can express these answer shapes but not ranges, so nothing
 * here claims to clamp probabilities — the LLM is never asked for one.
 */
export function buildSchema(questions: Record<string, Question>) {
  const properties: Record<string, unknown> = {}

  for (const [id, q] of Object.entries(questions)) {
    if (q.type === 'choice') {
      properties[id] = {
        type: 'object',
        additionalProperties: false,
        required: ['answer'],
        properties: { answer: { type: 'string', enum: Object.keys(q.criteria) } },
      }
    } else if (q.type === 'score') {
      properties[id] = {
        type: 'object',
        additionalProperties: false,
        required: ['level'],
        properties: { level: { type: 'integer', enum: q.criteria.map((_, i) => i) } },
      }
    } else {
      properties[id] = {
        type: 'object',
        additionalProperties: false,
        required: ['answer'],
        properties: { answer: { type: 'boolean' } },
      }
    }
  }

  return { type: 'object', additionalProperties: false, required: Object.keys(questions), properties }
}

/** Strict-mode enums are bounded; the route refuses requests past this. */
export const MAX_COMPARE_ENUM_VALUES = 500

export function countEnumValues(questions: Record<string, Question>): number {
  return Object.values(questions).reduce(
    (sum, q) => sum + (q.type === 'choice' ? Object.keys(q.criteria).length : q.type === 'score' ? q.criteria.length : 0),
    0
  )
}

/** Anything the model sees is rendered as text; objects as JSON, never "[object Object]". */
function text(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function describeQuestions(questions: Record<string, Question>): string {
  return Object.entries(questions)
    .map(([id, q]) => {
      const instructions = text(q.instructions)

      if (q.type === 'choice') {
        const options = Object.entries(q.criteria)
          .map(([key, desc]) => `    - ${key}${desc != null ? `: ${text(desc)}` : ''}`)
          .join('\n')
        return `${id} (choice): ${instructions}\n${options}`
      }
      if (q.type === 'score') {
        const levels = q.criteria.map((l, i) => `    ${i}: ${text(l)}`).join('\n')
        return `${id} (score, answer with the level index): ${instructions}\n${levels}`
      }
      const criteria = q.criteria
        ? `\n    true means: ${text(q.criteria.true)}\n    false means: ${text(q.criteria.false)}`
        : ''
      return `${id} (true/false): ${instructions || 'Decide using the criteria below.'}${criteria}`
    })
    .join('\n\n')
}

const SYSTEM_PROMPT = `You are a classifier. Read the STATE and answer every QUESTION using only the JSON schema you are given.
For a choice, pick exactly one of the listed option keys.
For a score, pick the level index whose description best matches.
For a true/false question, answer true or false.
Do not add prose.`

export type LlmAnswers = Record<string, { answer?: string | boolean; level?: number }>

export interface CompareOutcome {
  ok: boolean
  model: string
  answers: LlmAnswers
  /** Round trip of the attempt that produced the answer, body included. */
  ms: number
  promptTokens: number
  completionTokens: number
  /** Visitor-safe. Provider error bodies never reach the browser. */
  error?: string
  /** A timeout may still have been processed and billed. */
  mayHaveBilled: boolean
}

/**
 * Fastest first. A model that rejects one value is asked with the next; only
 * when every value is refused is the parameter dropped, since the provider's
 * default (usually "medium") would make the comparison unfairly slow.
 */
const EFFORT_LADDER = ['none', 'minimal', 'low'] as const

/** Remembered per instance: how far down the ladder each model had to go. */
const effortRung = new Map<string, number>()

function startingRung(model: string): number {
  // A catalogued model's setting was checked against the live API; it wins.
  const known = findLlmModel(model)
  if (known) return known.effort === null ? EFFORT_LADDER.length : EFFORT_LADDER.indexOf(known.effort)
  const configured = process.env.OPENAI_REASONING_EFFORT?.trim()
  if (configured) {
    const i = EFFORT_LADDER.indexOf(configured as (typeof EFFORT_LADDER)[number])
    if (i >= 0) return i
  }
  // gpt-5 accepted "minimal" but not "none"; later generations take "none".
  return /^gpt-5(-|$)/.test(model) ? 1 : 0
}

function reasoningEffortFor(model: string): string | null {
  const configured = process.env.OPENAI_REASONING_EFFORT?.trim()
  if (configured === 'off') return null
  const rung = effortRung.get(model) ?? startingRung(model)
  if (findLlmModel(model)) return rung >= EFFORT_LADDER.length ? null : EFFORT_LADDER[rung]
  if (rung >= EFFORT_LADDER.length) return null
  // A configured value outside the ladder is sent as-is, once.
  if (configured && !effortRung.has(model) && !(EFFORT_LADDER as readonly string[]).includes(configured)) {
    return configured
  }
  return EFFORT_LADDER[rung]
}

function stepDownEffort(model: string, rejected: string) {
  const i = (EFFORT_LADDER as readonly string[]).indexOf(rejected)
  const current = effortRung.get(model) ?? startingRung(model)
  effortRung.set(model, i >= 0 ? Math.max(current, i + 1) : current)
}

function visitorError(status: number): string {
  if (status === 401 || status === 403) return 'The comparison model is not configured correctly.'
  if (status === 429) return 'The comparison model is busy right now. Jev runs are unaffected.'
  if (status >= 500) return 'The comparison model is unavailable right now.'
  return `The comparison model rejected the request (${status}).`
}

export async function callOpenAi(
  request: JevRequest,
  apiKey: string,
  pricing: LlmPricing,
  deadline: number
): Promise<CompareOutcome> {
  const model = pricing.id
  const state = typeof request.state === 'string' ? request.state : JSON.stringify(request.state, null, 2)

  const baseBody = {
    model,
    max_completion_tokens: OPENAI_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `STATE:\n${state}\n\nQUESTIONS:\n${describeQuestions(request.questions)}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'decisions', strict: true, schema: buildSchema(request.questions) },
    },
  }

  const empty = { model, answers: {}, promptTokens: 0, completionTokens: 0 }

  // One real attempt plus, at most, one quick 400 per rung of the effort ladder.
  const maxAttempts = EFFORT_LADDER.length + 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effort = reasoningEffortFor(model)
    const body = effort ? { ...baseBody, reasoning_effort: effort } : baseBody

    const remaining = Math.floor(deadline - performance.now())
    if (remaining < 1_000) {
      return { ...empty, ok: false, ms: 0, error: 'There was not enough time left to ask the comparison model.', mayHaveBilled: false }
    }

    const started = performance.now()
    let res: Response
    let json: any
    try {
      res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(remaining),
      })
      json = await res.json().catch(() => null)
    } catch (err) {
      const ms = Math.round(performance.now() - started)
      const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return {
        ...empty,
        ok: false,
        ms,
        error: timedOut ? `The comparison model did not answer within ${Math.round(remaining / 1000)}s.` : 'Could not reach the comparison model.',
        mayHaveBilled: timedOut,
      }
    }
    const ms = Math.round(performance.now() - started)

    if (!res.ok) {
      const message: string = json?.error?.message ?? ''
      // A model that does not accept this effort value: step down the ladder
      // and ask again. These 400s come back before any inference, and only the
      // attempt that answers is timed.
      if (res.status === 400 && effort && attempt < maxAttempts && /reasoning[_ ]effort/i.test(message)) {
        stepDownEffort(model, effort)
        continue
      }
      console.error(JSON.stringify({ at: 'openai-compare', status: res.status, type: json?.error?.type, code: json?.error?.code }))
      return { ...empty, ok: false, ms, error: visitorError(res.status), mayHaveBilled: false }
    }

    const promptTokens = json?.usage?.prompt_tokens ?? 0
    const completionTokens = json?.usage?.completion_tokens ?? 0
    const choice = json?.choices?.[0]
    const content = choice?.message?.content

    if (choice?.message?.refusal || typeof content !== 'string') {
      return { ...empty, ok: false, ms, promptTokens, completionTokens, error: 'The comparison model declined to answer.', mayHaveBilled: true }
    }

    let answers: unknown
    try {
      answers = JSON.parse(content)
    } catch {
      return {
        ...empty,
        ok: false,
        ms,
        promptTokens,
        completionTokens,
        error:
          choice?.finish_reason === 'length'
            ? 'The comparison model ran out of output tokens before finishing.'
            : 'The comparison model returned JSON that did not parse.',
        mayHaveBilled: true,
      }
    }

    const shaped =
      answers && typeof answers === 'object' && !Array.isArray(answers)
        ? (answers as LlmAnswers)
        : null
    const missing = shaped ? Object.keys(request.questions).filter((id) => !Object.hasOwn(shaped, id)) : Object.keys(request.questions)
    if (!shaped || missing.length > 0) {
      return {
        ...empty,
        ok: false,
        ms,
        promptTokens,
        completionTokens,
        error: `The comparison model left ${missing.length} question${missing.length === 1 ? '' : 's'} unanswered.`,
        mayHaveBilled: true,
      }
    }

    return { ok: true, model: json?.model ?? model, answers: shaped, ms, promptTokens, completionTokens, mayHaveBilled: true }
  }

  return { ...empty, ok: false, ms: 0, error: 'The comparison model could not be reached.', mayHaveBilled: false }
}
