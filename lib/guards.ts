import 'server-only'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { createHash } from 'node:crypto'
import { PRICING, type LlmPricing } from './pricing'
import { clientIp, isAllowedOrigin, normaliseIp, originPolicyFromEnv } from './net'

/**
 * Abuse and spend guards for the public proxy.
 *
 * Lyzr's key pays for every anonymous run, so this module is the only thing
 * between a curious visitor and a drained budget. On Vercel Hobby there is no
 * Firewall, so all of it is app-level.
 *
 * Every Redis call is bounded and caught. A slow or failing counter store must
 * never be read as "allowed": on doubt, we refuse to spend.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback
}

export const LIMITS = {
  play: { perMinute: num(process.env.PLAY_MIN, 30), perDay: num(process.env.PLAY_DAY, 300) },
  /** perDay is the free comparison quota per network per UTC day (lib/compare-quota.ts). */
  compare: { perMinute: num(process.env.COMPARE_MIN, 10), perDay: num(process.env.COMPARE_DAY, 5) },
  /** Ceilings between the per-IP windows and the dollar cap, so a distributed
   *  burst degrades to 429 instead of burning the day's budget in minutes. */
  global: {
    jevPerMinute: num(process.env.GLOBAL_JEV_MIN, 600),
    comparePerMinute: num(process.env.GLOBAL_COMPARE_MIN, 60),
    jevPerDay: num(process.env.GLOBAL_JEV_DAY, 20_000),
    comparePerDay: num(process.env.GLOBAL_COMPARE_DAY, 1_500),
  },
  budget: {
    jevUsd: num(process.env.DAILY_JEV_BUDGET_USD, 10),
    openaiUsd: num(process.env.DAILY_OPENAI_BUDGET_USD, 15),
  },
} as const

/** Output allowance for the OpenAI pre-flight reserve; matches max_completion_tokens. */
export const OPENAI_MAX_OUTPUT_TOKENS = 400
const LOW_BUDGET_FRACTION = 0.8

/** Upstash calls must not eat the 10s function budget. */
const REDIS_TIMEOUT_MS = 800

export const KILL_SWITCH = process.env.JEVLAB_KILL_SWITCH === '1'

const isProduction = process.env.NODE_ENV === 'production'

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

const hasRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

export const redis = hasRedis
  ? Redis.fromEnv({
      // The default retries five times with exponential backoff, which alone can
      // outlast the function. One quick retry, then give up and fail closed.
      retry: { retries: 1, backoff: () => 50 },
    })
  : null

export const redisAvailable = hasRedis

/** Resolves with the value, or rejects once the deadline passes. */
function withTimeout<T>(promise: Promise<T>, ms = REDIS_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('redis timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Blocked callers cost zero Redis commands on their repeat attempts. */
const ephemeralCache = new Map<string, number>()

type Window = `${number} s` | `${number} m` | `${number} h` | `${number} d`

function limiter(tokens: number, window: Window, prefix: string) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `jevlab:${prefix}`,
    ephemeralCache,
    analytics: false,
    timeout: REDIS_TIMEOUT_MS,
  })
}

const limiters = {
  playMin: limiter(LIMITS.play.perMinute, '60 s', 'play:min'),
  playDay: limiter(LIMITS.play.perDay, '24 h', 'play:day'),
  compareMin: limiter(LIMITS.compare.perMinute, '60 s', 'compare:min'),
  globalJevMin: limiter(LIMITS.global.jevPerMinute, '60 s', 'g:jev:min'),
  globalJevDay: limiter(LIMITS.global.jevPerDay, '24 h', 'g:jev:day'),
  globalCompareMin: limiter(LIMITS.global.comparePerMinute, '60 s', 'g:cmp:min'),
  globalCompareDay: limiter(LIMITS.global.comparePerDay, '24 h', 'g:cmp:day'),
}

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

/**
 * The salt must be secret, or the hashed IPs are trivially reversible (IPv4
 * has only four billion values). An unset IP_HASH_SALT used to fall back to a
 * constant published in this repository. Now it falls back to a hash of the
 * TypeSafe key — secret and stable across instances — and warns once.
 */
const SALT = (() => {
  const explicit = process.env.IP_HASH_SALT?.trim()
  if (explicit) return explicit
  if (isProduction) {
    console.warn(JSON.stringify({ at: 'guards', warning: 'IP_HASH_SALT is unset; deriving one from the API key' }))
  }
  const seed = process.env.TYPESAFE_API_KEY ?? 'jevlab-local-development'
  return createHash('sha256').update(`jevlab-salt:${seed}`).digest('hex')
})()

export function callerKey(headers: Headers): string {
  const ip = normaliseIp(clientIp(headers))
  return createHash('sha256').update(`${ip}|${SALT}`).digest('hex').slice(0, 32)
}

const ORIGIN_POLICY = originPolicyFromEnv(process.env)

/** See lib/net.ts: a gate against embedding, not a security boundary. */
export function isSameOrigin(req: Request): boolean {
  return isAllowedOrigin(req.headers, ORIGIN_POLICY)
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export interface LimitVerdict {
  ok: boolean
  scope?: 'minute' | 'day' | 'global'
  retryAfterSec?: number
  resetAt?: number
  /** Set when the limiter could not be consulted; the caller fails closed. */
  unavailable?: boolean
}

const secondsUntil = (reset: number) => Math.max(1, Math.ceil((reset - Date.now()) / 1000))

export async function checkRateLimits(
  key: string,
  feature: 'play' | 'compare'
): Promise<LimitVerdict> {
  if (!redis) {
    // Local development runs with no external service. In production the
    // spend reservation fails closed a moment later anyway.
    return { ok: true }
  }

  const c = feature === 'compare'
  // Per-caller windows first. Checking the global ones first let a single
  // blocked caller drain everyone's shared quota with requests it was never
  // going to be served.
  const order = [
    ['minute', c ? limiters.compareMin : limiters.playMin, key],
    // Comparisons count against the daily quota instead (lib/compare-quota.ts),
    // which can hand a comparison back when OpenAI was never actually called.
    ['day', c ? null : limiters.playDay, key],
    ['global', c ? limiters.globalCompareMin : limiters.globalJevMin, 'all'],
    ['global', c ? limiters.globalCompareDay : limiters.globalJevDay, 'all'],
  ] as const

  for (const [scope, lim, id] of order) {
    if (!lim) continue
    try {
      const res = await lim.limit(id)
      // On a timeout Upstash answers success:true with reason 'timeout'.
      // That is "we don't know", and unknown must not mean allowed.
      if (res.reason === 'timeout') return { ok: false, scope: 'global', unavailable: true }
      if (!res.success) {
        return { ok: false, scope, retryAfterSec: secondsUntil(res.reset), resetAt: res.reset }
      }
    } catch {
      return { ok: false, scope: 'global', unavailable: true }
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Spend caps
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10)
const TTL_SECONDS = 60 * 60 * 48

export interface Reservation {
  ok: boolean
  resetsAt: string
  /** Why a reservation failed: over the cap, or counters unreachable. */
  reason?: 'budget' | 'counters'
  provider: 'jev' | 'openai'
  reservedUsd: number
  /** The day the reservation was taken on, so reconciling after midnight UTC
   *  settles against the same counter rather than tomorrow's. */
  day: string
}

function resetsAtFor(day: string): string {
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

/**
 * Reserve before the call, reconcile after. Charging only on the way back lets
 * concurrent requests overshoot the cap indefinitely.
 */
async function reserve(provider: 'jev' | 'openai', usd: number, capUsd: number): Promise<Reservation> {
  const day = today()
  const base = { provider, day, resetsAt: resetsAtFor(day) }

  if (!redis) {
    // Without counters nothing can observe the day's spend, so production
    // refuses rather than hand out an uncapped key.
    if (!isProduction) return { ...base, ok: true, reservedUsd: 0 }
    return { ...base, ok: false, reason: 'counters', reservedUsd: 0 }
  }

  const key = `jevlab:spend:${provider}:${day}`
  try {
    const total = await withTimeout(redis.incrbyfloat(key, usd))
    // Fire and forget: a missed TTL only means a key lingers past two days.
    redis.expire(key, TTL_SECONDS).catch(() => {})

    if (total > capUsd) {
      await withTimeout(redis.incrbyfloat(key, -usd)).catch(() => {})
      return { ...base, ok: false, reason: 'budget', reservedUsd: 0 }
    }
    return { ...base, ok: true, reservedUsd: usd }
  } catch {
    return { ...base, ok: false, reason: 'counters', reservedUsd: 0 }
  }
}

/**
 * Settle the difference between the estimate and what was actually billed.
 * Never throws: a result the visitor has already been charged for must not be
 * thrown away because a counter write failed.
 */
async function settle(r: Reservation, actualUsd: number): Promise<void> {
  if (!redis || !r.ok) return
  const delta = actualUsd - r.reservedUsd
  if (Math.abs(delta) < 1e-12) return
  try {
    await withTimeout(redis.incrbyfloat(`jevlab:spend:${r.provider}:${r.day}`, delta))
  } catch (err) {
    console.error(JSON.stringify({ at: 'guards', error: 'reconcile failed', provider: r.provider, delta }))
  }
}

export function reserveJevSpend(estimatedInputTokens: number): Promise<Reservation> {
  const usd = (estimatedInputTokens * PRICING.jev.inPerM) / 1_000_000
  return reserve('jev', usd, LIMITS.budget.jevUsd)
}

/** Jev bills input tokens only. */
export function settleJevSpend(r: Reservation, actualInputTokens: number): Promise<void> {
  return settle(r, (actualInputTokens * PRICING.jev.inPerM) / 1_000_000)
}

export function reserveOpenAiSpend(estimatedPromptTokens: number, pricing: LlmPricing = PRICING.llm): Promise<Reservation> {
  const usd =
    (estimatedPromptTokens * pricing.inPerM) / 1_000_000 +
    (OPENAI_MAX_OUTPUT_TOKENS * pricing.outPerM) / 1_000_000
  return reserve('openai', usd, LIMITS.budget.openaiUsd)
}

export function settleOpenAiSpend(r: Reservation, actualUsd: number): Promise<void> {
  return settle(r, actualUsd)
}

/**
 * When an upstream call timed out we cannot know what it billed: the provider
 * may have processed it fully. Keeping the reservation is the conservative
 * choice; refunding it to zero is how spend used to leak past the cap.
 */
export function keepReservation(_r: Reservation): Promise<void> {
  return Promise.resolve()
}

/** Only for failures where the provider certainly billed nothing. */
export function releaseReservation(r: Reservation): Promise<void> {
  return settle(r, 0)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type BudgetState = 'ok' | 'low' | 'paused'

function stateFor(fraction: number): BudgetState {
  return fraction >= 1 ? 'paused' : fraction >= LOW_BUDGET_FRACTION ? 'low' : 'ok'
}

/**
 * Jev and the comparison are reported separately: an exhausted OpenAI budget
 * turns off comparisons, not the site.
 */
export async function budgetState(): Promise<{
  state: BudgetState
  compare: BudgetState
  resetsAt: string
}> {
  const day = today()
  const resetsAt = resetsAtFor(day)

  if (KILL_SWITCH) return { state: 'paused', compare: 'paused', resetsAt }
  if (!redis) {
    // In production no counters means every run is refused; say so.
    return isProduction
      ? { state: 'paused', compare: 'paused', resetsAt }
      : { state: 'ok', compare: 'ok', resetsAt }
  }

  try {
    const [jevRaw, openaiRaw] = await withTimeout(
      Promise.all([
        redis.get<string | number>(`jevlab:spend:jev:${day}`),
        redis.get<string | number>(`jevlab:spend:openai:${day}`),
      ])
    )
    return {
      state: stateFor(Number(jevRaw ?? 0) / LIMITS.budget.jevUsd),
      compare: stateFor(Number(openaiRaw ?? 0) / LIMITS.budget.openaiUsd),
      resetsAt,
    }
  } catch {
    // Unreadable counters mean every spend reservation is failing closed too,
    // so the honest banner is "paused", not "ok".
    return { state: 'paused', compare: 'paused', resetsAt }
  }
}
