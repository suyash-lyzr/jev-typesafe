import 'server-only'
import { NextResponse } from 'next/server'
import type { ZodType, ZodTypeDef } from 'zod'
import {
  MAX_BODY_BYTES,
  MAX_STATE_CHARS,
  TOKEN_BUDGET_TOTAL,
  estimateTokens,
  stateChars,
} from './schema'
import type { JevRequest, RunError } from './schema'
import { KILL_SWITCH, callerKey, checkRateLimits, isSameOrigin, redisAvailable } from './guards'
import type { Reservation } from './guards'

/**
 * Everything both proxy routes must check before spending anything, in one
 * place. The two routes used to carry their own copies, and they drifted: the
 * comparison route skipped the state-size and token checks entirely.
 */

/** Hobby kills the function at ~10s. Everything is measured from arrival. */
export const HANDLER_BUDGET_MS = 9_000

export function fail(error: RunError, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(error, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export interface Preflight<E> {
  envelope: E
  request: JevRequest
  estimatedTokens: number
  /** Absolute performance.now() by which the handler must be finished. */
  deadline: number
  serverStart: number
}

export async function preflight<E extends { request: JevRequest }>(
  req: Request,
  schema: ZodType<E, ZodTypeDef, unknown>,
  limit: 'play' | 'compare',
  /**
   * Route-specific checks on a request that already parsed. They run before
   * the rate limit, so a request the route would refuse anyway never spends
   * the caller's quota.
   */
  validate?: (request: JevRequest) => RunError | null
): Promise<Preflight<E> | Response> {
  const serverStart = performance.now()
  const deadline = serverStart + HANDLER_BUDGET_MS

  // Origin gate: not a security boundary (curl can spoof it), but it stops
  // other sites using this deployment as a free Jev proxy from their pages.
  if (!isSameOrigin(req)) {
    return fail({ error: 'origin', message: 'This endpoint only serves Jev Lab.' }, 403)
  }

  if (KILL_SWITCH) {
    return fail({ error: 'paused', message: 'Live runs are paused right now.' }, 503)
  }

  // Refuse an oversized body before reading it, then measure what arrived in
  // bytes (a string's length counts UTF-16 units, not bytes).
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail({ error: 'validation', message: `Request body is larger than ${MAX_BODY_BYTES / 1000} KB.` }, 413)
  }
  const rawBody = await req.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return fail({ error: 'validation', message: `Request body is larger than ${MAX_BODY_BYTES / 1000} KB.` }, 413)
  }

  let envelope: E
  try {
    envelope = schema.parse(JSON.parse(rawBody))
  } catch (err: any) {
    // The first issue's own message and path, so the client can point at the
    // offending question instead of printing a generic rejection.
    const issue = Array.isArray(err?.issues) ? err.issues[0] : undefined
    return fail(
      {
        error: 'validation',
        message: issue?.message ?? 'That request does not match the System One schema.',
        path: Array.isArray(issue?.path) ? issue.path.map(String) : undefined,
        raw: err?.issues,
      },
      422
    )
  }

  const { request } = envelope

  if (stateChars(request.state) > MAX_STATE_CHARS) {
    return fail({ error: 'validation', message: `State is longer than ${MAX_STATE_CHARS.toLocaleString()} characters.` }, 422)
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

  const invalid = validate?.(request)
  if (invalid) return fail(invalid, 422)

  const verdict = await checkRateLimits(callerKey(req.headers), limit)
  if (!verdict.ok) {
    if (verdict.unavailable) {
      return fail({ error: 'counters_unavailable', message: 'Live runs are paused: usage counters are unavailable.' }, 503)
    }
    const what = limit === 'compare' ? 'comparisons' : 'runs'
    const message =
      verdict.scope === 'global'
        ? `Jev Lab is busy right now. Try again in a moment.`
        : verdict.scope === 'day'
          ? `You've used today's free ${what} from this network.${limit === 'compare' ? ' Jev-only runs still work.' : ''}`
          : `You've hit the per-minute limit for ${what}.${limit === 'compare' ? ' Jev-only runs still work.' : ''}`
    return fail(
      { error: 'rate_limited', message, scope: verdict.scope, retryAfterSec: verdict.retryAfterSec },
      429,
      verdict.retryAfterSec ? { 'Retry-After': String(verdict.retryAfterSec) } : {}
    )
  }

  return { envelope, request, estimatedTokens, deadline, serverStart }
}

/** The response for a failed reservation, shared so the wording cannot drift. */
export function budgetFailure(r: Reservation, provider: 'jev' | 'openai' = 'jev') {
  const retryAfter = Math.max(60, Math.ceil((Date.parse(r.resetsAt) - Date.now()) / 1000))

  if (r.reason === 'counters' || !redisAvailable) {
    return fail(
      { error: 'counters_unavailable', message: 'Live runs are paused: usage counters are unavailable.', scope: 'budget' },
      503
    )
  }
  return fail(
    {
      error: 'budget',
      message:
        provider === 'openai'
          ? "Today's comparison budget is used up. Jev runs are unaffected."
          : "Today's free budget is used up. Live runs return at 00:00 UTC.",
      scope: 'budget',
      resetsAt: r.resetsAt,
    },
    // 429 rather than 402: fetch wrappers and proxies mistreat 402.
    429,
    { 'Retry-After': String(retryAfter) }
  )
}
