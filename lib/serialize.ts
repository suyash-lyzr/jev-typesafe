import type { JevRequest, Question, State } from './schema'

/**
 * Turning the editor's shape into the exact body that goes on the wire.
 *
 * The editor keeps A/B variants beside their question so the two can be edited
 * together; the API has no notion of variants, so they travel as two ordinary
 * questions, `<id>__A` and `<id>__B`, in the same request. Because every
 * question is evaluated independently and in parallel, that costs only the
 * extra question's tokens — which is the whole point of the demo.
 */

export const VARIANT_A = '__A'
export const VARIANT_B = '__B'

export interface EditorRequest {
  state: State
  model: string
  questions: Record<string, Question>
  /** question id -> its B variant, when the user has opened one. */
  variants: Record<string, Question>
}

export function toWireRequest(editor: EditorRequest): JevRequest {
  const questions: Record<string, Question> = {}

  for (const [id, q] of Object.entries(editor.questions)) {
    // Own properties only: a question called `constructor` must not pick up
    // Object.prototype.constructor as its "variant".
    const variant = Object.hasOwn(editor.variants, id) ? editor.variants[id] : undefined
    if (variant) {
      questions[`${id}${VARIANT_A}`] = q
      questions[`${id}${VARIANT_B}`] = variant
    } else {
      questions[id] = q
    }
  }

  return { state: editor.state, model: editor.model, questions }
}

/** `severity__A` -> `{ baseId: 'severity', variant: 'A' }` */
export function parseWireId(wireId: string): { baseId: string; variant: 'A' | 'B' | null } {
  if (wireId.endsWith(VARIANT_A)) return { baseId: wireId.slice(0, -VARIANT_A.length), variant: 'A' }
  if (wireId.endsWith(VARIANT_B)) return { baseId: wireId.slice(0, -VARIANT_B.length), variant: 'B' }
  return { baseId: wireId, variant: null }
}

/**
 * Stable stringify: key order must not change the hash, or an innocent
 * re-render would invalidate a replay.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/**
 * Identifies a request for replay matching and the "request changed since run"
 * chip. The model is deliberately excluded: switching alias should not throw
 * away a recorded answer that is otherwise identical.
 */
export function requestHash(request: Pick<JevRequest, 'state' | 'questions'>): string {
  const input = canonical({ state: request.state, questions: request.questions })

  // djb2 — this only needs to be stable and fast, never cryptographic, and it
  // must run identically in the browser and in node.
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

export function editorRequestHash(editor: EditorRequest): string {
  return requestHash(toWireRequest(editor))
}

/** Question ids are ours and never reach the model, so a copy just needs to be unique. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** Reorders an object's keys; the editor's question order is the response order. */
export function moveKey<T>(record: Record<string, T>, id: string, delta: number): Record<string, T> {
  const keys = Object.keys(record)
  const from = keys.indexOf(id)
  if (from < 0) return record

  const to = Math.max(0, Math.min(keys.length - 1, from + delta))
  if (to === from) return record

  keys.splice(to, 0, ...keys.splice(from, 1))
  return Object.fromEntries(keys.map((k) => [k, record[k]]))
}
