import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The owner pass: one secret (COMPARE_OWNER_TOKEN) that lets its holder skip
 * the daily comparison quota. Visiting /api/owner?token=<secret> stores a
 * hash of the secret in an httpOnly cookie; the raw secret never sits in the
 * browser. Everything else still applies to the owner — the per-minute limit
 * and the daily OpenAI dollar cap — so a leaked link can't run up a bill.
 * Unset the variable and the pass stops working everywhere.
 */

export const OWNER_COOKIE = 'jevlab_owner'

const digest = (value: string) => createHash('sha256').update(`jevlab-owner:${value}`).digest()

function expected(): Buffer | null {
  const token = process.env.COMPARE_OWNER_TOKEN?.trim()
  return token && token.length >= 16 ? digest(token) : null
}

/** The cookie value for a correct token, or null. Constant-time comparison. */
export function cookieValueFor(token: string | null): string | null {
  const want = expected()
  if (!want || !token) return null
  const got = digest(token.trim())
  return timingSafeEqual(got, want) ? want.toString('hex') : null
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export function isOwner(req: Request): boolean {
  const want = expected()
  const value = readCookie(req.headers.get('cookie'), OWNER_COOKIE)
  if (!want || !value || !/^[0-9a-f]{64}$/.test(value)) return false
  return timingSafeEqual(Buffer.from(value, 'hex'), want)
}
