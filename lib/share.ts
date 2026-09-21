import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { z } from 'zod'
import { Question, State, MODEL_RE, DEFAULT_MODEL, EditorQuestionId } from './schema'
import { PolicySchema, reconcilePolicy } from './policy'

/**
 * Sharing a request without a database, and without the request reaching a log.
 *
 * The envelope rides in the URL *fragment*, which browsers never send to the
 * server. That keeps someone's pasted ticket out of Vercel's access logs, at
 * the cost of link-preview cards — a trade the privacy line on the dialog
 * explains rather than hides.
 *
 * Answers are never encoded. A link is an invitation to run something, not a
 * claim about what the model said.
 */

export const SHARE_VERSION = 1

/** Past this, chat apps start truncating links; we offer the JSON instead. */
export const SHARE_WARN_BYTES = 4_000
export const SHARE_MAX_BYTES = 16_000

/**
 * Everything in a link is untrusted: it is decoded on someone else's machine,
 * and its policy ends up in the code they copy. Every field is validated —
 * thresholds as numbers in range, ids in the question-id alphabet — and rules
 * that point at questions the link does not contain are dropped.
 */
const Envelope = z
  .object({
    v: z.literal(SHARE_VERSION),
    state: State,
    stateMode: z.enum(['text', 'json']).optional(),
    model: z.string().regex(MODEL_RE).default(DEFAULT_MODEL),
    questions: z.record(EditorQuestionId, Question).refine((q) => Object.keys(q).length <= 100),
    variants: z.record(EditorQuestionId, Question).optional(),
    policy: PolicySchema.optional(),
    compare: z.boolean().optional(),
    title: z.string().max(120).optional(),
  })
  .transform((e) => ({
    ...e,
    // An object state is JSON whatever the link says; a string defaults to text.
    stateMode: typeof e.state === 'string' ? (e.stateMode ?? 'text') : ('json' as const),
    variants: e.variants
      ? Object.fromEntries(Object.entries(e.variants).filter(([id]) => Object.hasOwn(e.questions, id)))
      : undefined,
    policy: e.policy ? reconcilePolicy(e.policy, Object.keys(e.questions)) : undefined,
  }))

export type ShareEnvelope = z.output<typeof Envelope>

export function encodeShare(envelope: Omit<z.input<typeof Envelope>, 'v'>): string {
  return compressToEncodedURIComponent(JSON.stringify({ v: SHARE_VERSION, ...envelope }))
}

export type DecodeResult =
  | { ok: true; envelope: ShareEnvelope }
  | { ok: false; reason: 'unreadable' | 'newer-version' }

export function decodeShare(encoded: string): DecodeResult {
  let parsedJson: unknown
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return { ok: false, reason: 'unreadable' }
    parsedJson = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  const version = (parsedJson as { v?: unknown })?.v
  if (typeof version === 'number' && version > SHARE_VERSION) {
    return { ok: false, reason: 'newer-version' }
  }

  const parsed = Envelope.safeParse(parsedJson)
  return parsed.success ? { ok: true, envelope: parsed.data } : { ok: false, reason: 'unreadable' }
}

export function shareUrl(origin: string, encoded: string): string {
  return `${origin}/play#s=${encoded}`
}

export type ShareSize = 'ok' | 'long' | 'too-long'

export function shareSize(url: string): ShareSize {
  const bytes = new TextEncoder().encode(url).length
  if (bytes > SHARE_MAX_BYTES) return 'too-long'
  if (bytes > SHARE_WARN_BYTES) return 'long'
  return 'ok'
}

export function urlBytes(url: string): number {
  return new TextEncoder().encode(url).length
}
