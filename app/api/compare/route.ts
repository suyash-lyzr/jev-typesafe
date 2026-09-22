import { NextResponse } from 'next/server'
import { CompareEnvelope, JevResponse, COMPARE_MODELS } from '@/lib/schema'
import type { JevRequest, RunError } from '@/lib/schema'
import {
  reserveJevSpend,
  settleJevSpend,
  reserveOpenAiSpend,
  settleOpenAiSpend,
  releaseReservation,
  keepReservation,
} from '@/lib/guards'
import type { Reservation } from '@/lib/guards'
import { callJev } from '@/lib/upstream'
import { callOpenAi, countEnumValues, MAX_COMPARE_ENUM_VALUES } from '@/lib/openai-compare'
import type { CompareOutcome } from '@/lib/openai-compare'
import { jevCostUsd, llmCostUsd, llmPricingFor } from '@/lib/pricing'
import { callerKey } from '@/lib/guards'
import { ownerQuota, returnQuota, takeQuota, type CompareQuota } from '@/lib/compare-quota'
import { isOwner } from '@/lib/owner'
import { LLM_MODELS, DEFAULT_LLM_MODEL, findLlmModel } from '@/lib/llm-models'
import { preflight, budgetFailure, fail } from '@/lib/proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * Both models, one invocation.
 *
 * Both calls leave this function at the same moment under Promise.allSettled,
 * and each reports its own round trip, body included. They are two separate
 * network calls — the page says so — not one request.
 */

/** Tighter than a plain run: a comparison spends two providers. */
const MAX_COMPARE_QUESTIONS = 12

function isStructured(v: unknown): boolean {
  return v !== null && typeof v === 'object'
}

/** The calls finish by here, leaving ~1s of the 9s budget to settle counters. */
const CALLS_BUDGET_MS = 8_000

/** Everything a comparison refuses that a plain run would accept. */
function compareOnlyError(request: JevRequest): RunError | null {
  const questionCount = Object.keys(request.questions).length
  if (questionCount > MAX_COMPARE_QUESTIONS) {
    return {
      error: 'validation',
      message: `Comparisons are capped at ${MAX_COMPARE_QUESTIONS} questions. This request has ${questionCount}.`,
    }
  }

  // A comparison spends OpenAI money even when the Jev half fails at once, so
  // an unknown model id (which TypeSafe rejects in milliseconds) would buy an
  // OpenAI call for free. Only known ids are compared.
  if (!COMPARE_MODELS.includes(request.model)) {
    return {
      error: 'validation',
      message: `Comparisons run on ${COMPARE_MODELS.join(', ')}. Switch the model to one of those.`,
    }
  }

  // Structured Outputs cannot express object-valued instructions or criteria
  // the way Jev reads them, so the two sides would not be doing the same job.
  const structured = Object.values(request.questions).some((q) => {
    if (isStructured(q.instructions)) return true
    if (q.type === 'choice') return Object.values(q.criteria).some(isStructured)
    if (q.type === 'score') return q.criteria.some(isStructured)
    return q.criteria ? isStructured(q.criteria.true) || isStructured(q.criteria.false) : false
  })
  if (structured) {
    return {
      error: 'validation',
      message:
        'This request uses structured (object) instructions or criteria. The comparison only handles plain-text questions, so the two sides would not be doing the same job.',
    }
  }

  if (countEnumValues(request.questions) > MAX_COMPARE_ENUM_VALUES) {
    return {
      error: 'validation',
      message: `This request has more options and levels than the comparison model's schema accepts (${MAX_COMPARE_ENUM_VALUES}). Trim the options, or run Jev on its own.`,
    }
  }
  return null
}

export async function POST(req: Request) {
  const pre = await preflight(req, CompareEnvelope, 'compare', compareOnlyError)
  if (pre instanceof Response) return pre
  const { request, estimatedTokens, serverStart } = pre

  // The visitor's pick, or the configured default; only catalogued models, at catalogued prices.
  const envDefault = findLlmModel(process.env.OPENAI_COMPARE_MODEL?.trim()) ? process.env.OPENAI_COMPARE_MODEL!.trim() : DEFAULT_LLM_MODEL
  const llmId = pre.envelope.llmModel ?? envDefault
  const pricingForModel = llmPricingFor(llmId)
  if (!pricingForModel) {
    return fail(
      { error: 'validation', message: `Compare with one of: ${LLM_MODELS.map((m) => m.id).join(', ')}.` },
      422
    )
  }

  // The free quota: checked after every other refusal, so a request we would
  // reject anyway never costs one.
  const caller = callerKey(req.headers)
  const owner = isOwner(req)
  const taken = owner ? { ok: true, quota: ownerQuota() } : await takeQuota(caller)
  if (!taken.ok) {
    return fail(
      {
        error: 'rate_limited',
        scope: 'quota',
        message: `You've used your ${taken.quota.limit} free comparisons for today. They reset at 00:00 UTC. Jev-only runs still work.`,
        resetsAt: taken.quota.resetsAt,
        quota: taken.quota,
      },
      429
    )
  }
  let quota: CompareQuota = taken.quota
  const questionCount = Object.keys(request.questions).length
  const callsDeadline = Math.min(pre.deadline, serverStart + CALLS_BUDGET_MS)

  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    return fail({ error: 'upstream_auth', message: 'Jev Lab is missing its TypeSafe API key.' }, 500)
  }
  const openaiKey = process.env.OPENAI_API_KEY
  const llmPricing = pricingForModel

  const jevReservation = await reserveJevSpend(estimatedTokens)
  if (!jevReservation.ok) return budgetFailure(jevReservation)

  // Reserve the LLM side before either call goes out. If it is over budget,
  // the Jev half still runs and the tab says why the other half did not.
  const llmReservation: Reservation | null = openaiKey ? await reserveOpenAiSpend(estimatedTokens, llmPricing) : null
  const llmCanRun = Boolean(openaiKey && llmReservation?.ok)

  const [jevSettled, llmSettled] = await Promise.allSettled([
    callJev(request, apiKey, callsDeadline),
    llmCanRun ? callOpenAi(request, openaiKey!, llmPricing, callsDeadline) : Promise.resolve(null),
  ])

  // --- settle both sides together ---------------------------------------------
  // Each ran independently, so each is settled on what it billed — the LLM
  // side is never refunded to zero because the Jev half failed. The two
  // counter writes go out in parallel so they fit in the remaining budget.
  const llm: CompareOutcome | null = llmSettled.status === 'fulfilled' ? llmSettled.value : null
  const llmCostUsd_ =
    llmReservation?.ok && llm && (llm.promptTokens > 0 || llm.completionTokens > 0)
      ? llmCostUsd(llm.promptTokens, llm.completionTokens, llmPricing)
      : 0

  // Hand the comparison back when OpenAI never did any work: no key, no
  // budget, or a rejection before inference. A visitor should not lose one of
  // their five to our configuration.
  if (!owner && (!llm || (!llm.ok && !llm.mayHaveBilled))) quota = await returnQuota(caller)

  function settleLlm(): Promise<unknown> {
    if (!llmReservation?.ok) return Promise.resolve()
    if (llmCostUsd_ > 0) return settleOpenAiSpend(llmReservation, llmCostUsd_)
    if (!llm || llm.mayHaveBilled) return keepReservation(llmReservation)
    return releaseReservation(llmReservation)
  }

  const jev = jevSettled.status === 'fulfilled' ? jevSettled.value : null
  if (!jev || !jev.ok) {
    await Promise.all([settleLlm(), jev && !jev.mayHaveBilled ? releaseReservation(jevReservation) : null])
    const error: RunError = jev && !jev.ok ? jev.error : { error: 'upstream', message: 'The Jev call failed.' }
    const status = error.error === 'validation' ? 422 : error.error === 'upstream_timeout' ? 504 : 502
    return fail(error, status)
  }

  const parsed = JevResponse.safeParse(jev.body)
  if (!parsed.success) {
    const billed = (jev.body as { usage?: { input_tokens?: unknown } })?.usage?.input_tokens
    await Promise.all([
      settleLlm(),
      typeof billed === 'number' ? settleJevSpend(jevReservation, billed) : keepReservation(jevReservation),
    ])
    return fail({ error: 'upstream', message: 'TypeSafe returned a response Jev Lab did not recognise.' }, 502)
  }

  const { model, answers, usage } = parsed.data
  await Promise.all([settleLlm(), settleJevSpend(jevReservation, usage.input_tokens)])

  const pricing = {
    id: llmPricing.id,
    inPerM: llmPricing.inPerM,
    outPerM: llmPricing.outPerM,
    confirmedOn: llmPricing.confirmedOn,
  }

  const compare = llm
    ? {
        llmModel: llm.model,
        ok: llm.ok,
        error: llm.error,
        answers: llm.answers,
        ms: llm.ms,
        costUsd: llmCostUsd_,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        pricing,
      }
    : {
        llmModel: llmPricing.id,
        ok: false,
        error: !openaiKey
          ? 'No OpenAI key is configured, so only the Jev half ran.'
          : llmReservation?.reason === 'counters'
            ? 'Usage counters are unavailable, so the comparison did not run. The Jev half is unaffected.'
            : "Today's comparison budget is used up. Jev runs are unaffected.",
        answers: {},
        ms: 0,
        costUsd: 0,
        promptTokens: 0,
        completionTokens: 0,
        pricing,
      }

  console.log(
    JSON.stringify({
      at: 'api/compare',
      status: 200,
      model,
      llm: compare.llmModel,
      llmOk: compare.ok,
      nQuestions: questionCount,
      inputTokens: usage.input_tokens,
      jevMs: jev.jevMs,
      llmMs: compare.ms,
    })
  )

  return NextResponse.json(
    {
      model,
      answers,
      usage,
      timing: { jevMs: jev.jevMs, serverMs: Math.round(performance.now() - serverStart), retries: jev.retries },
      costUsd: jevCostUsd(usage.input_tokens),
      replay: false,
      compare,
      quota,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
