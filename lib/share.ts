import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { z } from 'zod'
import { Question, State, MODEL_RE, DEFAULT_MODEL } from './schema'

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

const Envelope = z.object({
  v: z.literal(SHARE_VERSION),
  state: State,
  stateMode: z.enum(['text', 'json']).default('text'),
  model: z.string().regex(MODEL_RE).default(DEFAULT_MODEL),
  questions: z.record(Question),
  variants: z.record(Question).optional(),
  policy: z.unknown().optional(),
  compare: z.boolean().optional(),
  title: z.string().max(120).optional(),
})

export type ShareEnvelope = z.infer<typeof Envelope>

export function encodeShare(envelope: Omit<ShareEnvelope, 'v'>): string {
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
