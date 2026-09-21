import 'server-only'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { createHash } from 'node:crypto'
import { PRICING } from './pricing'

/**
 * Abuse and spend guards for the public proxy.
 *
 * Lyzr's key pays for every anonymous run, so this module is the only thing
 * between a curious visitor and a drained budget. On Vercel Hobby there is no
 * Firewall, so all of it is app-level.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const LIMITS = {
  play: { perMinute: num(process.env.PLAY_MIN, 30), perDay: num(process.env.PLAY_DAY, 300) },
  compare: { perMinute: num(process.env.COMPARE_MIN, 10), perDay: num(process.env.COMPARE_DAY, 20) },
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

/** Output allowance for the OpenAI pre-flight reserve; reconciled after the call. */
const OPENAI_OUTPUT_ALLOWANCE_TOKENS = 400
const LOW_BUDGET_FRACTION = 0.8

export const KILL_SWITCH = process.env.JEVLAB_KILL_SWITCH === '1'

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

const hasRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

export const redis = hasRedis ? Redis.fromEnv() : null

/** Blocked callers cost zero Redis commands on their repeat attempts. */
const ephemeralCache = new Map<string, number>()

function limiter(tokens: number, window: `${number} s` | `${number} m` | `${number} h` | `${number} d`, prefix: string) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `jevlab:${prefix}`,
    ephemeralCache,
    analytics: false,
  })
}

const limiters = {
  playMin: limiter(LIMITS.play.perMinute, '60 s', 'play:min'),
  playDay: limiter(LIMITS.play.perDay, '24 h', 'play:day'),
  compareMin: limiter(LIMITS.compare.perMinute, '60 s', 'compare:min'),
  compareDay: limiter(LIMITS.compare.perDay, '24 h', 'compare:day'),
  globalJevMin: limiter(LIMITS.global.jevPerMinute, '60 s', 'g:jev:min'),
  globalJevDay: limiter(LIMITS.global.jevPerDay, '24 h', 'g:jev:day'),
  globalCompareMin: limiter(LIMITS.global.comparePerMinute, '60 s', 'g:cmp:min'),
  globalCompareDay: limiter(LIMITS.global.comparePerDay, '24 h', 'g:cmp:day'),
}

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

/**
 * Never trust the client-settable first element of x-forwarded-for. Vercel
 * sets x-real-ip itself. IPv6 is bucketed to the /64 because a single host is
 * handed the whole prefix and could otherwise rotate through it freely.
 */
export function callerKey(headers: Headers): string {
  const raw =
    headers.get('x-real-ip') ??
    headers.get('x-vercel-forwarded-for') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'

  const ip = raw.includes(':') ? raw.split(':').slice(0, 4).join(':') : raw
  const salt = process.env.IP_HASH_SALT ?? 'jevlab-dev-salt'
  return createHash('sha256').update(ip + salt).digest('hex').slice(0, 32)
}

/**
 * Cheap origin gate. curl can spoof it, so it is not a security boundary —
 * it stops embedding and casual scraping of a free Jev proxy.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false

  const origin = req.headers.get('origin')
  if (!origin) return true // same-origin form posts and server-side prefetches omit it

  try {
    const host = req.headers.get('host')
    return new URL(origin).host === host
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export interface LimitVerdict {
  ok: boolean
  scope?: 'minute' | 'day' | 'global'
  retryAfterSec?: number
  remaining?: number
  resetAt?: number
}

const secondsUntil = (reset: number) => Math.max(1, Math.ceil((reset - Date.now()) / 1000))

export async function checkRateLimits(
  key: string,
  feature: 'play' | 'compare'
): Promise<LimitVerdict> {
  // Local dev without Redis: allow, so the app runs with no external service.
  if (!redis) return { ok: true }

  const globalMin = feature === 'compare' ? limiters.globalCompareMin : limiters.globalJevMin
  const globalDay = feature === 'compare' ? limiters.globalCompareDay : limiters.globalJevDay
  const perMin = feature === 'compare' ? limiters.compareMin : limiters.playMin
  const perDay = feature === 'compare' ? limiters.compareDay : limiters.playDay

  for (const [scope, lim, id] of [
    ['global', globalMin, 'all'],
    ['global', globalDay, 'all'],
    ['minute', perMin, key],
    ['day', perDay, key],
  ] as const) {
    if (!lim) continue
    const res = await lim.limit(id)
    if (!res.success) {
      return {
        ok: false,
        scope,
        retryAfterSec: secondsUntil(res.reset),
        remaining: 0,
        resetAt: res.reset,
      }
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Spend caps
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10)
const TTL_SECONDS = 60 * 60 * 48

export interface BudgetVerdict {
  ok: boolean
  resetsAt?: string
  /** Set when the reserve succeeded, so the caller can reconcile afterwards. */
  reservedUsd?: number
}

/**
 * Reserve before the call, reconcile after. Charging only on the way back lets
 * concurrent requests overshoot the cap indefinitely.
 */
async function reserve(provider: 'jev' | 'openai', usd: number, capUsd: number): Promise<BudgetVerdict> {
  const resetsAt = `${today()}T24:00:00Z`
  if (!redis) {
    // Local dev runs without Upstash so the app is usable with no external
    // service. In production, no counters means no way to know what has been
    // spent, so we fail closed rather than hand out an uncapped key.
    if (process.env.NODE_ENV !== 'production') return { ok: true, resetsAt, reservedUsd: 0 }
    return { ok: false, resetsAt }
  }

  const key = `jevlab:spend:${provider}:${today()}`
  const total = await redis.incrbyfloat(key, usd)
  await redis.expire(key, TTL_SECONDS)

  if (total > capUsd) {
    await redis.incrbyfloat(key, -usd)
    return { ok: false, resetsAt }
  }
  return { ok: true, resetsAt, reservedUsd: usd }
}

/** Settle the difference between the estimate and what was actually used. */
async function reconcile(provider: 'jev' | 'openai', reservedUsd: number, actualUsd: number) {
  if (!redis) return
  const delta = actualUsd - reservedUsd
  if (Math.abs(delta) < 1e-9) return
  const key = `jevlab:spend:${provider}:${today()}`
  await redis.incrbyfloat(key, delta)
}

export async function reserveJevSpend(estimatedInputTokens: number): Promise<BudgetVerdict> {
  const usd = (estimatedInputTokens * PRICING.jev.inPerM) / 1_000_000
  return reserve('jev', usd, LIMITS.budget.jevUsd)
}

export async function reconcileJevSpend(reservedUsd: number, actualInputTokens: number) {
  return reconcile('jev', reservedUsd, (actualInputTokens * PRICING.jev.inPerM) / 1_000_000)
}

export async function reserveOpenAiSpend(estimatedPromptTokens: number): Promise<BudgetVerdict> {
  const usd =
    (estimatedPromptTokens * PRICING.llm.inPerM) / 1_000_000 +
    (OPENAI_OUTPUT_ALLOWANCE_TOKENS * PRICING.llm.outPerM) / 1_000_000
  return reserve('openai', usd, LIMITS.budget.openaiUsd)
}

export async function reconcileOpenAiSpend(reservedUsd: number, actualUsd: number) {
  return reconcile('openai', reservedUsd, actualUsd)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type BudgetState = 'ok' | 'low' | 'paused'

export async function budgetState(): Promise<{
  state: BudgetState
  jevSpentUsd: number
  openaiSpentUsd: number
  resetsAt: string
}> {
  const resetsAt = `${today()}T24:00:00Z`
  if (KILL_SWITCH) return { state: 'paused', jevSpentUsd: 0, openaiSpentUsd: 0, resetsAt }
  if (!redis) return { state: 'ok', jevSpentUsd: 0, openaiSpentUsd: 0, resetsAt }

  const [jevRaw, openaiRaw] = await Promise.all([
    redis.get<string | number>(`jevlab:spend:jev:${today()}`),
    redis.get<string | number>(`jevlab:spend:openai:${today()}`),
  ])

  const jevSpentUsd = Number(jevRaw ?? 0)
  const openaiSpentUsd = Number(openaiRaw ?? 0)
  const jevFrac = jevSpentUsd / LIMITS.budget.jevUsd
  const openaiFrac = openaiSpentUsd / LIMITS.budget.openaiUsd
  const worst = Math.max(jevFrac, openaiFrac)

  const state: BudgetState = worst >= 1 ? 'paused' : worst >= LOW_BUDGET_FRACTION ? 'low' : 'ok'
  return { state, jevSpentUsd, openaiSpentUsd, resetsAt }
}

export const redisAvailable = hasRedis
