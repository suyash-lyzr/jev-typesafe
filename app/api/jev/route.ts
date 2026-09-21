import { NextResponse } from 'next/server'
import { ProxyEnvelope, JevResponse, MAX_BODY_BYTES, MAX_STATE_CHARS, stateChars, estimateTokens, TOKEN_BUDGET_TOTAL } from '@/lib/schema'
import type { RunError, RunResult } from '@/lib/schema'
import {
  KILL_SWITCH,
  callerKey,
  checkRateLimits,
  isSameOrigin,
  reserveJevSpend,
  reconcileJevSpend,
  redisAvailable,
} from '@/lib/guards'
import { callJev } from '@/lib/upstream'
import { jevCostUsd } from '@/lib/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Hobby caps this; every internal deadline is derived to finish well inside it. */
export const maxDuration = 10

function fail(error: RunError, status: number, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(error, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

export async function POST(req: Request) {
  const serverStart = performance.now()

  // 1. Origin gate. Not a security boundary (curl can spoof it), but it stops
  //    other sites using us as a free Jev proxy.
  if (!isSameOrigin(req)) {
    return fail({ error: 'origin', message: 'This endpoint only serves Jev Lab.' }, 403)
  }

  // 2. Kill switch.
  if (KILL_SWITCH) {
    return fail(
      { error: 'paused', message: 'Live runs are paused right now. Presets replay recorded answers.' },
      503
    )
  }

  // 3. Size guard before parsing, so a huge body cannot cost us anything.
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return fail(
      { error: 'validation', message: `Request body is larger than ${MAX_BODY_BYTES / 1000} KB.` },
      413
    )
  }

  let envelope
  try {
    envelope = ProxyEnvelope.parse(JSON.parse(rawBody))
  } catch (err: any) {
    // Surface the first issue's own message and path so the client can point
    // at the offending question card instead of printing a generic rejection.
    const issue = Array.isArray(err?.issues) ? err.issues[0] : undefined
    return fail(
      {
        error: 'validation',
        message: issue?.message ?? 'That request does not match the System One schema.',
        path: Array.isArray(issue?.path) ? issue.path.map(String) : undefined,
        raw: err?.issues ?? String(err),
      },
      422
    )
  }

  const { request, feature, presetId } = envelope

  if (stateChars(request.state) > MAX_STATE_CHARS) {
    return fail(
      { error: 'validation', message: `State is longer than ${MAX_STATE_CHARS} characters.` },
      422
    )
  }

  const estimatedTokens = estimateTokens(request.state) + estimateTokens(request.questions)
  if (estimatedTokens > TOKEN_BUDGET_TOTAL) {
    return fail(
      {
        error: 'validation',
        message: `This request is about ${estimatedTokens.toLocaleString()} tokens; Jev's budget is ${TOKEN_BUDGET_TOTAL.toLocaleString()}.`,
      },
      422
    )
  }

  // 4. Rate limits: global ceilings first, then this caller's windows.
  const key = callerKey(req.headers)
  const verdict = await checkRateLimits(key, feature === 'compare' ? 'compare' : 'play')
  if (!verdict.ok) {
    return fail(
      {
        error: 'rate_limited',
        message:
          verdict.scope === 'global'
            ? 'Jev Lab is busy right now. Try again in a moment.'
            : verdict.scope === 'day'
              ? "You've used today's free runs from this network. Presets still replay recorded answers."
              : "You've hit the per-minute limit.",
        scope: verdict.scope,
        retryAfterSec: verdict.retryAfterSec,
      },
      429,
      verdict.retryAfterSec ? { 'Retry-After': String(verdict.retryAfterSec) } : {}
    )
  }

  // 5. Reserve spend before calling, so concurrent requests cannot overshoot.
  const budget = await reserveJevSpend(estimatedTokens)
  if (!budget.ok) {
    const message = redisAvailable
      ? "Today's free budget is used up. Presets still run from recorded responses; live runs return at 00:00 UTC."
      : 'Live runs are paused: usage counters are unavailable.'
    return fail(
      // 429 rather than 402: fetch wrappers and proxies mistreat 402 as a payment error.
      { error: redisAvailable ? 'budget' : 'counters_unavailable', message, scope: 'budget', resetsAt: budget.resetsAt },
      redisAvailable ? 429 : 503,
      { 'Retry-After': '3600' }
    )
  }

  // 6. Call TypeSafe.
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    return fail({ error: 'upstream_auth', message: 'Jev Lab is missing its TypeSafe API key.' }, 500)
  }

  const result = await callJev(request, apiKey)

  if (!result.ok) {
    // Nothing was spent upstream; hand the reservation back.
    await reconcileJevSpend(budget.reservedUsd ?? 0, 0)
    const status = result.error.error === 'validation' ? 422 : 502
    console.log(
      JSON.stringify({
        at: 'api/jev',
        status,
        error: result.error.error,
        feature,
        presetId,
        retries: result.retries,
      })
    )
    return fail({ ...result.error, retries: result.retries }, status)
  }

  const parsed = JevResponse.safeParse(result.body)
  if (!parsed.success) {
    await reconcileJevSpend(budget.reservedUsd ?? 0, 0)
    return fail(
      {
        error: 'upstream',
        message: 'TypeSafe returned a response Jev Lab did not recognise.',
        raw: result.body,
      },
      502
    )
  }

  const { model, answers, usage } = parsed.data
  await reconcileJevSpend(budget.reservedUsd ?? 0, usage.input_tokens)

  const payload: RunResult = {
    model,
    answers,
    usage,
    timing: {
      jevMs: result.jevMs,
      serverMs: Math.round(performance.now() - serverStart),
      retries: result.retries,
    },
    costUsd: jevCostUsd(usage.input_tokens),
    replay: false,
  }

  // One structured line per call. Never the state, instructions or criteria.
  console.log(
    JSON.stringify({
      at: 'api/jev',
      status: 200,
      model,
      feature,
      presetId,
      nQuestions: Object.keys(request.questions).length,
      inputTokens: usage.input_tokens,
      jevMs: result.jevMs,
      retries: result.retries,
    })
  )

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
