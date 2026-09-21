import 'server-only'
import type { JevRequest, RunError } from './schema'
import { normaliseUpstreamError } from './errors'

/**
 * The call to TypeSafe, bounded by one absolute deadline.
 *
 * Vercel Hobby kills a function at ~10s. The deadline is passed in by the
 * handler — measured from when the *request* arrived, not from when this call
 * starts — so time already spent on rate limits and counters is not
 * double-counted.
 *
 * Retry rules, each learned the hard way:
 *  - At most two attempts in total. An earlier version retried network errors
 *    with no pause and no cap, and one request made 20,000 calls in seven
 *    seconds against a failing endpoint.
 *  - Timeouts are integers. AbortSignal.timeout throws on a fraction, and that
 *    throw was being caught and retried in a tight loop.
 *  - A timed-out attempt is never retried: it may already have been processed
 *    and billed, and the remaining budget is too short to be worth it.
 */

export const UPSTREAM_URL = 'https://api.typesafe.ai/v1/systemone'

/** A single attempt never waits longer than this. */
export const ATTEMPT_TIMEOUT_MS = 6_000
/** Don't start another attempt without room for it to mean anything. */
const MIN_ATTEMPT_MS = 1_500
const MAX_ATTEMPTS = 2
const RETRY_STATUSES = new Set([429, 529, 502, 503])

export interface UpstreamSuccess {
  ok: true
  body: unknown
  /** Round trip of the attempt that succeeded, including reading the body. */
  jevMs: number
  /** Everything, including a failed first attempt and its backoff. */
  totalMs: number
  retries: number
}

export interface UpstreamFailure {
  ok: false
  error: RunError
  jevMs: number
  totalMs: number
  retries: number
  /**
   * True when the provider may have processed (and billed) the request —
   * a timeout, or a response we could not read. The caller keeps its spend
   * reservation instead of refunding it.
   */
  mayHaveBilled: boolean
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * @param deadline absolute `performance.now()` value by which we must be done.
 */
export async function callJev(
  request: JevRequest,
  apiKey: string,
  deadline: number
): Promise<UpstreamResult> {
  const started = performance.now()
  let retries = 0
  let jevMs = 0

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining < MIN_ATTEMPT_MS) {
      return {
        ok: false,
        error: { error: 'upstream_timeout', message: 'There was not enough time left to reach TypeSafe.' },
        jevMs,
        totalMs: Math.round(performance.now() - started),
        retries,
        mayHaveBilled: false,
      }
    }

    const attemptTimeout = Math.min(ATTEMPT_TIMEOUT_MS, remaining)
    const callStart = performance.now()

    let res: Response
    try {
      res = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(attemptTimeout),
        cache: 'no-store',
      })
    } catch (err) {
      jevMs = Math.round(performance.now() - callStart)
      const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')

      if (timedOut) {
        return {
          ok: false,
          error: {
            error: 'upstream_timeout',
            message: `TypeSafe did not answer within ${Math.round(attemptTimeout / 1000)}s.`,
          },
          jevMs,
          totalMs: Math.round(performance.now() - started),
          retries,
          mayHaveBilled: true,
        }
      }

      // No response at all: a refused or reset connection never reached the
      // model. One retry, after a real pause.
      if (attempt < MAX_ATTEMPTS) {
        retries++
        await sleep(250 + Math.floor(Math.random() * 250))
        continue
      }
      return {
        ok: false,
        error: { error: 'network', message: 'Could not reach TypeSafe.' },
        jevMs,
        totalMs: Math.round(performance.now() - started),
        retries,
        mayHaveBilled: false,
      }
    }

    // Headers arrived, so the request reached TypeSafe. If the body then fails
    // to arrive, the call may well have been processed and billed: never send
    // it again, and keep the reservation.
    let body: unknown
    try {
      body = await readBody(res)
    } catch {
      return {
        ok: false,
        error: { error: 'upstream', message: 'TypeSafe’s answer was cut off before it arrived.' },
        jevMs: Math.round(performance.now() - callStart),
        totalMs: Math.round(performance.now() - started),
        retries,
        mayHaveBilled: res.ok,
      }
    }
    jevMs = Math.round(performance.now() - callStart)

    if (res.ok) {
      return { ok: true, body, jevMs, totalMs: Math.round(performance.now() - started), retries }
    }

    const error = normaliseUpstreamError(res.status, body)

    if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
      const header = Number(res.headers.get('retry-after'))
      const backoff =
        Number.isFinite(header) && header > 0
          ? Math.min(header * 1000, 2_000)
          : 300 + Math.floor(Math.random() * 300)

      // Only wait if a second attempt could still finish in time.
      if (deadline - performance.now() - backoff >= MIN_ATTEMPT_MS) {
        retries++
        await sleep(backoff)
        continue
      }
    }

    // A rejection (4xx) is answered before inference and billed nothing.
    return {
      ok: false,
      error: { ...error, retries },
      jevMs,
      totalMs: Math.round(performance.now() - started),
      retries,
      mayHaveBilled: false,
    }
  }

  // Unreachable: every path in the loop returns or continues within the cap.
  return {
    ok: false,
    error: { error: 'upstream', message: 'TypeSafe did not answer.' },
    jevMs,
    totalMs: Math.round(performance.now() - started),
    retries,
    mayHaveBilled: false,
  }
}

export { normaliseUpstreamError }
