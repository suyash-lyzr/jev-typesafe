import { NextResponse } from 'next/server'
import { CompareEnvelope, JevResponse, MAX_BODY_BYTES, estimateTokens } from '@/lib/schema'
import type { RunError } from '@/lib/schema'
import {
  KILL_SWITCH,
  callerKey,
  checkRateLimits,
  isSameOrigin,
  reserveJevSpend,
  reconcileJevSpend,
  reserveOpenAiSpend,
  reconcileOpenAiSpend,
  redisAvailable,
} from '@/lib/guards'
import { callJev } from '@/lib/upstream'
import { callOpenAi } from '@/lib/openai-compare'
import { jevCostUsd, llmCostUsd, PRICING } from '@/lib/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * Both models, one invocation.
 *
 * The earlier design issued two fetches so the Jev lane could land first and a
 * stopwatch could "race" them. That made the headline claim false — two
 * invocations, possibly two cold starts — and doubled the quota cost. Here both
 * calls leave the same function at the same moment and each reports its own
 * server-measured time.
 */

/** Compare is capped tighter than a plain run: it costs two providers. */
const MAX_COMPARE_QUESTIONS = 12
const JEV_DEADLINE_MS = 8_000
const OPENAI_TIMEOUT_MS = 7_000

function fail(error: RunError, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(error, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export async function POST(req: Request) {
  const serverStart = performance.now()

  if (!isSameOrigin(req)) {
    return fail({ error: 'origin', message: 'This endpoint only serves Jev Lab.' }, 403)
  }
  if (KILL_SWITCH) {
    return fail({ error: 'paused', message: 'Live runs are paused right now.' }, 503)
  }

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return fail({ error: 'validation', message: 'Request body is too large.' }, 413)
  }

  let envelope
  try {
    envelope = CompareEnvelope.parse(JSON.parse(rawBody))
  } catch (err: any) {
    const issue = Array.isArray(err?.issues) ? err.issues[0] : undefined
    return fail(
      { error: 'validation', message: issue?.message ?? 'That request does not match the schema.', raw: err?.issues },
      422
    )
  }

  const { request } = envelope
  const questionCount = Object.keys(request.questions).length

  if (questionCount > MAX_COMPARE_QUESTIONS) {
    return fail(
      {
        error: 'validation',
        message: `Comparisons are capped at ${MAX_COMPARE_QUESTIONS} questions so both sides stay inside one request. This one has ${questionCount}.`,
      },
      422
    )
  }

  // Structured Outputs cannot express a nested object criteria the way Jev can,
  // so say that plainly rather than producing an unfair comparison.
  const hasStructuredCriteria = Object.values(request.questions).some((q) => {
    if (q.type === 'choice') return Object.values(q.criteria).some((d) => d && typeof d === 'object')
    if (q.type === 'score') return q.criteria.some((d) => d && typeof d === 'object')
    return typeof q.instructions === 'object' && q.instructions !== null
  })
  if (hasStructuredCriteria) {
    return fail(
      {
        error: 'validation',
        message:
          'This request uses structured (object) instructions or criteria. The comparison only handles plain-text questions, so the two sides would not be doing the same job.',
      },
      422
    )
  }

  const key = callerKey(req.headers)
  const verdict = await checkRateLimits(key, 'compare')
  if (!verdict.ok) {
    return fail(
      {
        error: 'rate_limited',
        message:
          verdict.scope === 'day'
            ? "You've used today's comparisons from this network. Jev-only runs still work."
            : "You've hit the per-minute comparison limit. Jev-only runs still work.",
        scope: verdict.scope,
        retryAfterSec: verdict.retryAfterSec,
      },
      429,
      verdict.retryAfterSec ? { 'Retry-After': String(verdict.retryAfterSec) } : {}
    )
  }

  const apiKey = process.env.TYPESAFE_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return fail({ error: 'upstream_auth', message: 'Jev Lab is missing its TypeSafe API key.' }, 500)
  }

  const estimatedTokens = estimateTokens(request.state) + estimateTokens(request.questions)

  const jevBudget = await reserveJevSpend(estimatedTokens)
  if (!jevBudget.ok) {
    return fail(
      {
        error: redisAvailable ? 'budget' : 'counters_unavailable',
        message: redisAvailable
          ? "Today's free budget is used up. Live runs return at 00:00 UTC."
          : 'Live runs are paused: usage counters are unavailable.',
        scope: 'budget',
        resetsAt: jevBudget.resetsAt,
      },
      redisAvailable ? 429 : 503
    )
  }

  // Reserve the LLM side too, before either call goes out.
  const llmBudget = openaiKey ? await reserveOpenAiSpend(estimatedTokens) : { ok: false as const }

  const [jevResult, llmResult] = await Promise.allSettled([
    callJev(request, apiKey, JEV_DEADLINE_MS),
    openaiKey && llmBudget.ok
      ? callOpenAi(request, openaiKey, PRICING.llm.id, OPENAI_TIMEOUT_MS)
      : Promise.resolve(null),
  ])

  // --- Jev half --------------------------------------------------------------
  if (jevResult.status !== 'fulfilled' || !jevResult.value.ok) {
    await reconcileJevSpend(jevBudget.reservedUsd ?? 0, 0)
    if ('reservedUsd' in llmBudget && llmBudget.reservedUsd) {
      await reconcileOpenAiSpend(llmBudget.reservedUsd, 0)
    }
    const error: RunError =
      jevResult.status === 'fulfilled' && !jevResult.value.ok
        ? jevResult.value.error
        : { error: 'upstream', message: 'The Jev call failed.' }
    return fail(error, 502)
  }

  const jev = jevResult.value
  const parsed = JevResponse.safeParse(jev.body)
  if (!parsed.success) {
    await reconcileJevSpend(jevBudget.reservedUsd ?? 0, 0)
    return fail(
      { error: 'upstream', message: 'TypeSafe returned an unrecognised response.', raw: jev.body },
      502
    )
  }

  const { model, answers, usage } = parsed.data
  await reconcileJevSpend(jevBudget.reservedUsd ?? 0, usage.input_tokens)

  // --- LLM half: a failure here never blocks the Jev half --------------------
  const llm = llmResult.status === 'fulfilled' ? llmResult.value : null
  let compare = undefined

  if (llm) {
    const costUsd = llmCostUsd(llm.promptTokens, llm.completionTokens)
    if ('reservedUsd' in llmBudget && llmBudget.reservedUsd) {
      await reconcileOpenAiSpend(llmBudget.reservedUsd, costUsd)
    }
    compare = {
      llmModel: llm.model,
      ok: llm.ok,
      error: llm.error,
      answers: llm.answers,
      ms: llm.ms,
      costUsd,
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens,
    }
  } else if (!openaiKey) {
    compare = {
      llmModel: PRICING.llm.id,
      ok: false,
      error: 'No OpenAI key is configured, so only the Jev half ran.',
      answers: {},
      ms: 0,
      costUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
  } else {
    compare = {
      llmModel: PRICING.llm.id,
      ok: false,
      error: "Today's comparison budget is used up. Jev runs are unaffected.",
      answers: {},
      ms: 0,
      costUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
  }

  console.log(
    JSON.stringify({
      at: 'api/compare',
      status: 200,
      model,
      llm: compare?.llmModel,
      llmOk: compare?.ok,
      nQuestions: questionCount,
      jevMs: jev.jevMs,
      llmMs: compare?.ms,
    })
  )

  return NextResponse.json(
    {
      model,
      answers,
      usage,
      timing: {
        jevMs: jev.jevMs,
        serverMs: Math.round(performance.now() - serverStart),
        retries: jev.retries,
      },
      costUsd: jevCostUsd(usage.input_tokens),
      replay: false,
      compare,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
