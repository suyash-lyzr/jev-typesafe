import type { Answer, JevRequest, Question, Usage } from './schema'
import type { Policy } from './policy'

/**
 * Per-browser conveniences only.
 *
 * Every read is wrapped: private windows, blocked site data and full quotas all
 * throw, and none of them should break the page. Nothing here is authoritative;
 * if it comes back empty the app still works.
 */

export const KEYS = {
  runs: 'jevlab.runs.v1',
  progress: 'jevlab.progress.v1',
  settings: 'jevlab.settings.v1',
  session: 'jevlab.session.v1',
  limits: 'jevlab.limits.v1',
} as const

/** Count is not enough: one pasted 32k state can blow the ~5 MB origin quota. */
const MAX_RUNS = 30
const MAX_RUNS_BYTES = 1_500_000
const MAX_STORED_STATE_CHARS = 16_000

export interface CompareRecord {
  llmModel: string
  /** False when the LLM half failed or did not run; `error` says why. */
  ok?: boolean
  error?: string
  answers: Record<string, unknown>
  ms: number
  costUsd: number
  promptTokens: number
  completionTokens: number
  /** The prices the server actually charged, never guessed in the browser. */
  pricing?: { id: string; inPerM: number; outPerM: number; confirmedOn: string | null }
}

export interface RunRecord {
  id: string
  ts: number
  title: string
  presetId?: string
  variantId?: string
  /** The exact body that was sent. */
  request: JevRequest
  /**
   * The editor's own shape, so reopening a run restores A/B variants, the
   * policy and the state mode instead of flattening `sev__A` / `sev__B` into
   * two unrelated questions.
   */
  editor?: {
    questions: Record<string, Question>
    variants: Record<string, Question>
    stateMode: 'text' | 'json'
    policy?: Policy
    compare?: boolean
  }
  /** Set when the state was too large to keep; the run can be viewed, not re-sent. */
  stateTruncated?: boolean
  answers: Record<string, Answer>
  usage: Usage
  timing: { jevMs: number; serverMs: number; retries: number }
  clientMs?: number
  costUsd: number
  model: string
  replay: boolean
  compare?: CompareRecord
}

export interface Settings {
  readingGuide: boolean
  splitRatio: number
  dismissedBanner?: string
}

export interface SessionTotals {
  startedAt: number
  runs: number
  inputTokens: number
  costUsd: number
}

export const DEFAULT_SETTINGS: Settings = { readingGuide: true, splitRatio: 0.5 }

const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const probe = '__jevlab_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

// --- runs ------------------------------------------------------------------

/** Whatever is stored is checked for shape: another tab or an old version may have written it. */
export function loadRuns(): RunRecord[] {
  const runs = read<unknown>(KEYS.runs, [])
  if (!Array.isArray(runs)) return []
  return runs.filter(
    (r): r is RunRecord =>
      Boolean(r) &&
      typeof r === 'object' &&
      typeof (r as RunRecord).id === 'string' &&
      typeof (r as RunRecord).request === 'object' &&
      typeof (r as RunRecord).answers === 'object'
  )
}

/** Oldest first out, and an oversized state is dropped rather than stored. */
export function saveRun(run: RunRecord): RunRecord[] {
  const stateChars =
    typeof run.request.state === 'string'
      ? run.request.state.length
      : JSON.stringify(run.request.state).length

  const stored: RunRecord =
    stateChars > MAX_STORED_STATE_CHARS
      ? {
          ...run,
          stateTruncated: true,
          request: {
            ...run.request,
            state: `[state of ${stateChars.toLocaleString()} characters — too large to keep in this browser]`,
          },
        }
      : run

  let runs = [stored, ...loadRuns()].slice(0, MAX_RUNS)

  while (runs.length > 1 && JSON.stringify(runs).length > MAX_RUNS_BYTES) {
    runs = runs.slice(0, -1)
  }

  write(KEYS.runs, runs)
  return runs
}

export function clearRuns(): void {
  try {
    window.localStorage.removeItem(KEYS.runs)
  } catch {
    /* nothing to clear */
  }
}

// --- session ---------------------------------------------------------------

export function loadSession(): SessionTotals {
  const fallback: SessionTotals = { startedAt: Date.now(), runs: 0, inputTokens: 0, costUsd: 0 }
  const session = read<unknown>(KEYS.session, fallback) as Partial<SessionTotals> | null
  const valid =
    session &&
    typeof session === 'object' &&
    typeof session.startedAt === 'number' &&
    typeof session.runs === 'number' &&
    typeof session.costUsd === 'number'
  if (!valid || Date.now() - session.startedAt! > SESSION_MAX_AGE_MS) return fallback
  return session as SessionTotals
}

export function addToSession(inputTokens: number, costUsd: number): SessionTotals {
  const session = loadSession()
  const next: SessionTotals = {
    startedAt: session.startedAt,
    runs: session.runs + 1,
    inputTokens: session.inputTokens + inputTokens,
    costUsd: session.costUsd + costUsd,
  }
  write(KEYS.session, next)
  return next
}

// --- settings --------------------------------------------------------------

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  write(KEYS.settings, next)
  return next
}

// --- lesson progress -------------------------------------------------------

export interface LessonProgress {
  steps: Record<number, boolean>
  done: boolean
  doneAt?: number
  /** The checkpoint passed on a live run at some point. */
  checkpoint?: boolean
}

export function loadProgress(): Record<string, LessonProgress> {
  return read<Record<string, LessonProgress>>(KEYS.progress, {})
}

export function saveProgress(slug: string, patch: Partial<LessonProgress>): Record<string, LessonProgress> {
  const all = loadProgress()
  const current = all[slug] ?? { steps: {}, done: false }
  const next = { ...all, [slug]: { ...current, ...patch, steps: { ...current.steps, ...patch.steps } } }
  write(KEYS.progress, next)
  return next
}

export function resetProgress(): void {
  try {
    window.localStorage.removeItem(KEYS.progress)
  } catch {
    /* nothing to clear */
  }
}

// --- limits status ---------------------------------------------------------

export interface LimitStatus {
  status: 'fails' | 'passes'
  model: string
  ts: number
}

export function loadLimitStatuses(): Record<string, LimitStatus> {
  return read<Record<string, LimitStatus>>(KEYS.limits, {})
}

export function saveLimitStatus(slug: string, status: LimitStatus): void {
  write(KEYS.limits, { ...loadLimitStatuses(), [slug]: status })
}

// --- policy per preset -----------------------------------------------------

export function policyKey(presetId: string): string {
  return `jevlab.policy.${presetId}.v1`
}

export function loadPolicy(presetId: string): Policy | null {
  return read<Policy | null>(policyKey(presetId), null)
}

export function savePolicy(presetId: string, policy: Policy): void {
  write(policyKey(presetId), policy)
}
