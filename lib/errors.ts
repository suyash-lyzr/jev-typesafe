import type { RunError } from './schema'

/**
 * Mapping TypeSafe's error bodies to something a person can act on.
 *
 * Pure and framework-free on purpose: the proxy uses it to normalise upstream
 * failures, and the client uses the same copy when rendering the error card,
 * so the two can never describe the same failure differently.
 *
 * Written against real recorded bodies (content/recorded/errors/), not the
 * docs — docs.typesafe.ai/api lists the status codes but publishes no shape,
 * and the shapes turn out to be three different ones.
 */

/**
 * Friendly text for `error_type` codes that arrive with no message at all.
 * `max_tokens_exceeded` carries nothing but its code, so without this the
 * visitor would be shown a bare object.
 */
const ERROR_TYPE_COPY: Record<string, string> = {
  max_tokens_exceeded:
    "This request is past Jev's token budget: 64k for the whole request, 32k for the state plus the longest question.",
  api_usage_error: 'TypeSafe rejected the request as malformed.',
}

/**
 * What the API actually returns:
 *
 *   400 + detail: "Too many score levels. Must have at most 10 levels."
 *   400 + detail: { error_type: "api_usage_error", message: "Invalid request." }
 *   400 + detail: { error_type: "max_tokens_exceeded" }          // no message
 *   422 + detail: [{ type, loc: ["body", ...], msg, input, ctx }] // FastAPI
 *
 * Note that most validation failures are **400, not 422**; only body-shape
 * errors come back as 422.
 */
export function normaliseUpstreamError(status: number, body: unknown): RunError {
  const raw = body

  if (status === 422 || status === 400) {
    const detail = (body as Record<string, any>)?.detail

    // FastAPI issue array. `loc` starts with "body", dropped so the path lines
    // up with our own request shape and can point at a question card.
    if (Array.isArray(detail) && detail.length > 0) {
      const issue = detail[0]
      const loc: string[] = Array.isArray(issue?.loc) ? issue.loc.map(String) : []
      return {
        error: 'validation',
        message:
          typeof issue?.msg === 'string' ? issue.msg : `TypeSafe rejected the request (${status}).`,
        path: loc[0] === 'body' ? loc.slice(1) : loc,
        raw,
      }
    }

    // A plain sentence — the most common case, and already readable.
    if (typeof detail === 'string' && detail.trim()) {
      return { error: 'validation', message: detail, raw }
    }

    // A coded object; `message` is optional.
    if (detail && typeof detail === 'object') {
      const code = typeof detail.error_type === 'string' ? detail.error_type : undefined
      const message =
        (typeof detail.message === 'string' && detail.message.trim()
          ? detail.message
          : undefined) ??
        (code ? ERROR_TYPE_COPY[code] : undefined) ??
        `TypeSafe rejected the request (${status}).`
      return { error: 'validation', message, raw }
    }

    return { error: 'validation', message: `TypeSafe rejected the request (${status}).`, raw }
  }

  if (status === 401 || status === 403) {
    // Our key, never the visitor's — surface it as our problem.
    return { error: 'upstream_auth', message: 'Jev Lab could not authenticate with TypeSafe.', raw }
  }

  if (status === 429) {
    return {
      error: 'upstream',
      message: 'TypeSafe is rate-limiting us right now. Try again in a moment.',
      raw,
    }
  }

  if (status === 529 || status >= 500) {
    return {
      error: 'upstream',
      message: 'TypeSafe is busy or unavailable. Try again in a moment.',
      raw,
    }
  }

  return { error: 'upstream', message: `TypeSafe returned ${status}.`, raw }
}

/**
 * The single place every failure gets its visitor-facing wording, so the copy
 * matrix lives in code rather than scattered through components.
 */
export function errorCardCopy(e: RunError): { title: string; body: string } {
  switch (e.error) {
    case 'validation':
      return { title: 'TypeSafe rejected the request', body: e.message }
    case 'rate_limited':
      return {
        title: e.scope === 'day' ? "Today's free runs are used up" : 'Slow down a moment',
        body: e.retryAfterSec ? `${e.message} Try again in ${e.retryAfterSec}s.` : e.message,
      }
    case 'budget':
      return { title: "Today's free budget is used up", body: e.message }
    case 'counters_unavailable':
    case 'paused':
      return { title: 'Live runs are paused', body: e.message }
    case 'upstream_auth':
      return { title: 'Jev Lab cannot reach TypeSafe', body: e.message }
    case 'upstream_timeout':
      return { title: 'TypeSafe did not answer in time', body: e.message }
    case 'origin':
      return { title: 'Blocked', body: e.message }
    case 'network':
      return { title: 'Could not reach the server', body: e.message }
    default:
      return { title: 'Something went wrong', body: e.message }
  }
}
