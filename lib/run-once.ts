'use client'

import type { JevRequest, RunError, RunResult } from './schema'
import { addToSession } from './storage'

/**
 * One request outside the playground store — for the Limits page, where each
 * card runs on its own. Goes through the same proxy, limits and budget as
 * everything else.
 */
export async function runOnce(
  request: JevRequest,
  context: { feature: 'limits' | 'lesson' | 'landing'; presetId?: string; variantId?: string }
): Promise<{ ok: true; result: RunResult } | { ok: false; error: RunError }> {
  try {
    const res = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, ...context }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) {
      return {
        ok: false,
        error:
          body && typeof body === 'object' && 'error' in body
            ? (body as RunError)
            : { error: 'upstream', message: `The server answered ${res.status}.` },
      }
    }
    const result = body as RunResult
    try {
      addToSession(result.usage.input_tokens, result.costUsd)
    } catch {
      /* convenience only */
    }
    return { ok: true, result }
  } catch {
    return { ok: false, error: { error: 'network', message: 'Could not reach the server.' } }
  }
}
