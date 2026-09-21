import { NextResponse } from 'next/server'
import { ProxyEnvelope, JevResponse } from '@/lib/schema'
import type { RunResult } from '@/lib/schema'
import { reserveJevSpend, settleJevSpend, releaseReservation, keepReservation } from '@/lib/guards'
import { callJev } from '@/lib/upstream'
import { jevCostUsd } from '@/lib/pricing'
import { preflight, budgetFailure, fail } from '@/lib/proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Hobby caps this; every internal deadline is derived to finish well inside it. */
export const maxDuration = 10

export async function POST(req: Request) {
  // The route decides which quota applies, never the body: a client-supplied
  // `feature` used to be able to spend someone's comparison quota here.
  const pre = await preflight(req, ProxyEnvelope, 'play')
  if (pre instanceof Response) return pre
  const { envelope, request, estimatedTokens, deadline, serverStart } = pre

  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    return fail({ error: 'upstream_auth', message: 'Jev Lab is missing its TypeSafe API key.' }, 500)
  }

  // Reserve before calling, so concurrent requests cannot overshoot the cap.
  const reservation = await reserveJevSpend(estimatedTokens)
  if (!reservation.ok) return budgetFailure(reservation)

  const result = await callJev(request, apiKey, deadline)

  if (!result.ok) {
    // A rejection billed nothing; a timeout may have been processed anyway.
    await (result.mayHaveBilled ? keepReservation(reservation) : releaseReservation(reservation))
    const status = result.error.error === 'validation' ? 422 : result.error.error === 'upstream_timeout' ? 504 : 502
    console.log(
      JSON.stringify({
        at: 'api/jev',
        status,
        error: result.error.error,
        feature: envelope.feature,
        presetId: envelope.presetId,
        retries: result.retries,
      })
    )
    return fail({ ...result.error, retries: result.retries }, status)
  }

  const parsed = JevResponse.safeParse(result.body)
  if (!parsed.success) {
    // TypeSafe answered 200, so it billed. Settle from its own usage when it
    // sent one, otherwise keep the estimate.
    const billed = (result.body as { usage?: { input_tokens?: unknown } })?.usage?.input_tokens
    await (typeof billed === 'number' ? settleJevSpend(reservation, billed) : keepReservation(reservation))
    return fail({ error: 'upstream', message: 'TypeSafe returned a response Jev Lab did not recognise.' }, 502)
  }

  const { model, answers, usage } = parsed.data
  await settleJevSpend(reservation, usage.input_tokens)

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
      feature: envelope.feature,
      presetId: envelope.presetId,
      nQuestions: Object.keys(request.questions).length,
      inputTokens: usage.input_tokens,
      jevMs: result.jevMs,
      retries: result.retries,
    })
  )

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
