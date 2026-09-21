import 'server-only'
import type { JevRequest, RunError } from './schema'
import { normaliseUpstreamError } from './errors'

/**
 * The call to TypeSafe, with a single hard deadline.
 *
 * Vercel Hobby kills a function at ~10s, so a naive "12s timeout × 3 attempts"
 * plan gets the process killed mid-retry and the visitor sees an opaque 504
 * instead of a calm "TypeSafe is busy" card. Everything here is derived from
 * one deadline instead.
 */

export const UPSTREAM_URL = 'https://api.typesafe.ai/v1/systemone'
export const MODELS_URL = 'https://api.typesafe.ai/v1/models'

/** Whole-handler budget, comfortably inside Hobby's ceiling. */
export const JEV_DEADLINE_MS = 9_000
/** A single attempt never waits longer than this. */
export const ATTEMPT_TIMEOUT_MS = 6_000
/** Don't start another attempt without room for it to mean anything. */
const MIN_RETRY_ROOM_MS = 2_000
const RETRY_STATUSES = new Set([429, 529])

export interface UpstreamSuccess {
  ok: true
  body: unknown
  jevMs: number
  retries: number
}

export interface UpstreamFailure {
  ok: false
  error: RunError
  jevMs: number
  retries: number
}

export type UpstreamResult = UpstreamSuccess | UpstreamFailure

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function callJev(
  request: JevRequest,
  apiKey: string,
  deadlineMs = JEV_DEADLINE_MS
): Promise<UpstreamResult> {
  const started = performance.now()
  const deadline = started + deadlineMs
  let retries = 0
  let last: RunError | null = null

  for (;;) {
    const remaining = deadline - performance.now()
    if (remaining <= 0) break

    const attemptTimeout = Math.min(ATTEMPT_TIMEOUT_MS, remaining)
    const callStart = performance.now()

    try {
      const res = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(attemptTimeout),
        cache: 'no-store',
      })

      const body = await readBody(res)
      const jevMs = Math.round(performance.now() - callStart)

      if (res.ok) return { ok: true, body, jevMs, retries }

      last = normaliseUpstreamError(res.status, body)

      if (RETRY_STATUSES.has(res.status)) {
        const retryAfter = Number(res.headers.get('retry-after')) * 1000
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 1_500)
          : 300 * 2 ** retries + Math.random() * 200

        if (deadline - performance.now() - backoff > MIN_RETRY_ROOM_MS) {
          retries++
          await new Promise((r) => setTimeout(r, backoff))
          continue
        }
      }

      return { ok: false, error: { ...last, retries }, jevMs, retries }
    } catch (err) {
      const jevMs = Math.round(performance.now() - callStart)
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError'

      last = timedOut
        ? { error: 'upstream_timeout', message: `TypeSafe did not answer within ${Math.round(attemptTimeout / 1000)}s.` }
        : { error: 'network', message: 'Could not reach TypeSafe.' }

      if (deadline - performance.now() > MIN_RETRY_ROOM_MS) {
        retries++
        continue
      }
      return { ok: false, error: { ...last, retries }, jevMs, retries }
    }
  }

  return {
    ok: false,
    error: last ?? { error: 'upstream_timeout', message: 'TypeSafe did not answer in time.', retries },
    jevMs: Math.round(performance.now() - started),
    retries,
  }
}

export { normaliseUpstreamError }
