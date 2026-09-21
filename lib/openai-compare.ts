import 'server-only'
import type { JevRequest, Question } from './schema'

/**
 * The LLM side of the comparison.
 *
 * Fairness is the whole point, so a few choices are deliberate and are stated
 * on /compare rather than buried here:
 *
 *  - The LLM gets its fastest configuration (minimal reasoning effort), not a
 *    configuration chosen to make it look slow.
 *  - Retries are off, so a transient 5xx cannot quietly inflate its latency.
 *  - We never ask it for a "confidence". A number a model writes in its JSON is
 *    not a distribution it computed, and printing the two side by side as if
 *    they were comparable would be dishonest.
 *  - Only the fetch is timed, not our own serialisation.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/** Structured Outputs rejects minimum/maximum, so ranges are clamped after the fact. */
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
        properties: {
          level: { type: 'integer', enum: q.criteria.map((_, i) => i) },
        },
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

  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(questions),
    properties,
  }
}

function describeQuestions(questions: Record<string, Question>): string {
  return Object.entries(questions)
    .map(([id, q]) => {
      const instructions =
        typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions)

      if (q.type === 'choice') {
        const options = Object.entries(q.criteria)
          .map(([key, desc]) => `    - ${key}${desc ? `: ${typeof desc === 'string' ? desc : JSON.stringify(desc)}` : ''}`)
          .join('\n')
        return `${id} (choice): ${instructions}\n${options}`
      }
      if (q.type === 'score') {
        const levels = q.criteria
          .map((l, i) => `    ${i}: ${typeof l === 'string' ? l : JSON.stringify(l)}`)
          .join('\n')
        return `${id} (score, answer with the level index): ${instructions}\n${levels}`
      }
      const criteria = q.criteria
        ? `\n    yes: ${q.criteria.true}\n    no: ${q.criteria.false}`
        : ''
      return `${id} (true/false): ${instructions}${criteria}`
    })
    .join('\n\n')
}

const SYSTEM_PROMPT = `You are a classifier. Read the STATE and answer every QUESTION using only the JSON schema you are given.
For a choice, pick exactly one of the listed option keys.
For a score, pick the level index whose description best matches.
For a true/false question, answer true or false.
Do not add prose.`

export interface CompareOutcome {
  ok: boolean
  model: string
  answers: Record<string, { answer?: string | boolean; level?: number }>
  ms: number
  promptTokens: number
  completionTokens: number
  error?: string
}

export async function callOpenAi(
  request: JevRequest,
  apiKey: string,
  model: string,
  timeoutMs: number
): Promise<CompareOutcome> {
  const state = typeof request.state === 'string' ? request.state : JSON.stringify(request.state, null, 2)
  const body = {
    model,
    // The fastest configuration the model offers, so the comparison is not rigged.
    reasoning_effort: 'minimal',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `STATE:\n${state}\n\nQUESTIONS:\n${describeQuestions(request.questions)}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'decisions', strict: true, schema: buildSchema(request.questions) },
    },
  }

  const started = performance.now()

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const ms = Math.round(performance.now() - started)
    const json = await res.json()

    if (!res.ok) {
      return {
        ok: false,
        model,
        answers: {},
        ms,
        promptTokens: 0,
        completionTokens: 0,
        error: json?.error?.message ?? `OpenAI returned ${res.status}.`,
      }
    }

    const content = json?.choices?.[0]?.message?.content
    let answers: Record<string, { answer?: string | boolean; level?: number }> = {}
    try {
      answers = JSON.parse(content)
    } catch {
      return {
        ok: false,
        model,
        answers: {},
        ms,
        promptTokens: json?.usage?.prompt_tokens ?? 0,
        completionTokens: json?.usage?.completion_tokens ?? 0,
        error: 'The model returned JSON that did not parse.',
      }
    }

    return {
      ok: true,
      model: json?.model ?? model,
      answers,
      ms,
      promptTokens: json?.usage?.prompt_tokens ?? 0,
      completionTokens: json?.usage?.completion_tokens ?? 0,
    }
  } catch (err) {
    const ms = Math.round(performance.now() - started)
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    return {
      ok: false,
      model,
      answers: {},
      ms,
      promptTokens: 0,
      completionTokens: 0,
      error: timedOut ? `The model did not answer within ${Math.round(timeoutMs / 1000)}s.` : 'Could not reach OpenAI.',
    }
  }
}
