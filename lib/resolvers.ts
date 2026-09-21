import type { Answer } from './schema'

/**
 * The code half of the "keep exact checks in code" rule.
 *
 * Jev reads; these compute. Every function here takes answers the model gave
 * and does the part the jaggedness guide says not to ask it for — counting,
 * comparing dates — so the Limits page and lesson 6 can show the working, not
 * just claim it.
 */

const noul = (a: Answer | undefined) => (a?.type === 'noul' ? a.noul : null)
const choice = (a: Answer | undefined) => (a?.type === 'choice' ? a.choice : null)

/** Count the yes answers among questions sharing a prefix: `item_0`, `item_1`, … */
export function sumNouls(
  answers: Record<string, Answer>,
  prefix: string,
  threshold = 0.5
): { count: number; yes: string[]; total: number } {
  const ids = Object.keys(answers)
    .filter((id) => id.startsWith(prefix))
    .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)))
  const yes = ids.filter((id) => (noul(answers[id]) ?? 0) > threshold)
  return { count: yes.length, yes, total: ids.length }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface DateParts {
  month: string | null
  day: string | null
  year: string | null
}

export type ResolvedDate =
  | { ok: true; iso: string; date: Date }
  | { ok: false; reason: string }

/** Assemble a real date from parts the model picked, or say exactly what is missing. */
export function assembleDate(parts: DateParts): ResolvedDate {
  const { month, day, year } = parts
  for (const [name, value] of [['month', month], ['day', day], ['year', year]] as const) {
    if (!value || value === 'none') return { ok: false, reason: `no ${name} stated` }
    if (value === 'ambiguous') return { ok: false, reason: `the ${name} is ambiguous` }
  }
  const m = MONTHS.indexOf(month!)
  const d = Number(day)
  const y = Number(year)
  if (m < 0 || !Number.isInteger(d) || !Number.isInteger(y)) return { ok: false, reason: 'unreadable parts' }

  const date = new Date(Date.UTC(y, m, d))
  // Catches Feb 30 and friends: the calendar, not the model, decides what exists.
  if (date.getUTCMonth() !== m || date.getUTCDate() !== d) return { ok: false, reason: `${month} ${d} does not exist` }
  return { ok: true, iso: date.toISOString().slice(0, 10), date }
}

export function datePartsFrom(answers: Record<string, Answer>, prefix: string): DateParts {
  return {
    month: choice(answers[`${prefix}_month`]),
    day: choice(answers[`${prefix}_day`]),
    year: choice(answers[`${prefix}_year`]),
  }
}

/** Compare two dates in code, or refuse and say why. */
export function compareDates(a: ResolvedDate, b: ResolvedDate): string {
  if (!a.ok) return `Cannot order them: in a, ${a.reason}. Ask rather than guess.`
  if (!b.ok) return `Cannot order them: in b, ${b.reason}. Ask rather than guess.`
  const diff = Math.round((a.date.getTime() - b.date.getTime()) / 86_400_000)
  if (diff === 0) return `Same day: ${a.iso}.`
  return diff < 0
    ? `a (${a.iso}) is ${-diff} day${diff === -1 ? '' : 's'} before b (${b.iso}).`
    : `a (${a.iso}) is ${diff} day${diff === 1 ? '' : 's'} after b (${b.iso}).`
}

/** Whole days from a to b, done by the calendar — or why it cannot be done. */
export function daysBetween(a: ResolvedDate, b: ResolvedDate): { ok: true; days: number } | { ok: false; reason: string } {
  if (!a.ok) return { ok: false, reason: `in start, ${a.reason}` }
  if (!b.ok) return { ok: false, reason: `in end, ${b.reason}` }
  return { ok: true, days: Math.round((b.date.getTime() - a.date.getTime()) / 86_400_000) }
}
