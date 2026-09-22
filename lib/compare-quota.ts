import 'server-only'
import { LIMITS, redis } from './guards'

/**
 * The free comparison quota: LIMITS.compare.perDay (5 by default) per network
 * per UTC day, because each comparison spends Lyzr's OpenAI credit.
 *
 * A plain counter rather than a sliding window, so it can do two things a
 * rate limiter can't: tell the page how many are left before anyone runs, and
 * hand one back when OpenAI was never actually called (no key, budget
 * exhausted, or a request it rejected before doing any work).
 *
 * Without Redis (local development) it counts in memory, per server process.
 * In production without Redis the spend reservation fails closed anyway.
 */

import type { CompareQuota } from './schema'
export type { CompareQuota }

const memory = new Map<string, number>()

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function nextMidnightUtc(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return d.toISOString()
}

const keyFor = (caller: string) => `jevlab:cmpq:${utcDay()}:${caller}`

function shape(used: number): CompareQuota {
  const limit = LIMITS.compare.perDay
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: nextMidnightUtc() }
}

export async function readQuota(caller: string): Promise<CompareQuota> {
  const key = keyFor(caller)
  if (!redis) return shape(memory.get(key) ?? 0)
  const v = await redis.get<number | string>(key)
  return shape(Number(v ?? 0))
}

/** Takes one comparison. `ok: false` when none are left; nothing is taken then. */
export async function takeQuota(caller: string): Promise<{ ok: boolean; quota: CompareQuota }> {
  const key = keyFor(caller)
  const limit = LIMITS.compare.perDay
  if (!redis) {
    const used = memory.get(key) ?? 0
    if (used >= limit) return { ok: false, quota: shape(used) }
    memory.set(key, used + 1)
    return { ok: true, quota: shape(used + 1) }
  }
  const used = await redis.incr(key)
  if (used === 1) await redis.expire(key, 60 * 60 * 48)
  if (used > limit) {
    await redis.decr(key)
    return { ok: false, quota: shape(limit) }
  }
  return { ok: true, quota: shape(used) }
}

/** Gives one back: the comparison never reached OpenAI. */
export async function returnQuota(caller: string): Promise<CompareQuota> {
  const key = keyFor(caller)
  if (!redis) {
    const used = Math.max(0, (memory.get(key) ?? 0) - 1)
    memory.set(key, used)
    return shape(used)
  }
  const used = Math.max(0, await redis.decr(key))
  return shape(used)
}
