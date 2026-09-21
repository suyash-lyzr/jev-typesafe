/**
 * Caller identity and origin checks, as pure functions.
 *
 * Kept free of `server-only` and of any framework so they can be tested
 * directly: both have already had bugs that only showed up on real inputs
 * (compressed IPv6, ports, a Host header rewritten by a proxy).
 */

// ---------------------------------------------------------------------------
// IP normalisation
// ---------------------------------------------------------------------------

/** Expand an IPv6 address to eight lowercase hextets, or return null. */
export function expandIpv6(input: string): string[] | null {
  let addr = input.toLowerCase()

  // An embedded IPv4 tail ("::ffff:1.2.3.4") becomes two hextets.
  const v4Tail = addr.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4Tail) {
    const [a, b, c, d] = v4Tail.slice(1).map(Number)
    if ([a, b, c, d].some((n) => n > 255)) return null
    const hi = ((a << 8) | b).toString(16)
    const lo = ((c << 8) | d).toString(16)
    addr = addr.slice(0, addr.length - v4Tail[0].length) + `${hi}:${lo}`
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []

  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 1) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }

  if (groups.length !== 8) return null
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => g.replace(/^0+(?=.)/, ''))
}

/**
 * The part of an address that identifies one caller.
 *
 * IPv4 is used whole. IPv6 is cut to its /64, because a single host is handed
 * the whole prefix and could otherwise rotate through it to dodge per-IP
 * limits. IPv4-mapped IPv6 is unwrapped to plain IPv4 so the same client is
 * one bucket whichever way the platform reports it.
 */
export function normaliseIp(raw: string): string {
  let ip = raw.trim()

  // "[2001:db8::1]:443" → "2001:db8::1"
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (bracketed) ip = bracketed[1]

  // "1.2.3.4:5678" → "1.2.3.4" (IPv4 has no other reason to contain a colon)
  const v4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (v4WithPort) ip = v4WithPort[1]

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip

  if (ip.includes(':')) {
    const mapped = ip.toLowerCase().match(/^(?:0*:)*:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (mapped) return mapped[1]

    const groups = expandIpv6(ip)
    if (groups) {
      // Also catch ::ffff:0102:0304 written in hex.
      if (groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') {
        const hi = parseInt(groups[6], 16)
        const lo = parseInt(groups[7], 16)
        return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
      }
      return `${groups.slice(0, 4).join(':')}::/64`
    }
  }

  return ip.toLowerCase() || 'unknown'
}

/**
 * Where the caller's address comes from. Vercel sets x-real-ip itself; the
 * first element of x-forwarded-for is client-controlled and only used as a
 * last resort (local development, where nothing else is set).
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-real-ip') ??
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

// ---------------------------------------------------------------------------
// Origin gate
// ---------------------------------------------------------------------------

/** "https://a.com:443" and "a.com" compare equal; ports other than the default stay. */
export function normaliseHost(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const defaultPort = url.protocol === 'http:' ? '80' : '443'
    return url.port && url.port !== defaultPort ? `${url.hostname}:${url.port}` : url.hostname
  } catch {
    return null
  }
}

export interface OriginPolicy {
  /** Hosts this deployment answers to, beyond the request's own Host. */
  allowedHosts: string[]
}

export function originPolicyFromEnv(env: Record<string, string | undefined>): OriginPolicy {
  const hosts = [env.NEXT_PUBLIC_SITE_URL, env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
  for (const extra of (env.ALLOWED_ORIGINS ?? '').split(',')) hosts.push(extra)
  return {
    allowedHosts: hosts.map(normaliseHost).filter((h): h is string => Boolean(h)),
  }
}

/**
 * A cheap gate, not a security boundary — curl can send any header it likes.
 * It stops other sites from using this deployment as a free Jev proxy from
 * their own pages, which is the realistic abuse.
 *
 * The Origin is compared against the request's Host *and* x-forwarded-host
 * *and* the configured site URLs, so a proxy that rewrites Host (a custom
 * domain in front of *.vercel.app) does not lock out every real visitor.
 *
 * A listed origin passes even when the browser calls the request cross-site.
 * The API serves no CORS headers, though, so ALLOWED_ORIGINS is for other
 * hosts serving this same app (custom domains, preview URLs), not for
 * third-party pages calling the API from their own origin.
 */
export function isAllowedOrigin(headers: Headers, policy: OriginPolicy): boolean {
  const site = headers.get('sec-fetch-site')
  const origin = headers.get('origin')
  const originHost = origin ? normaliseHost(origin) : null

  if (site && site !== 'same-origin' && site !== 'none') {
    // same-site or cross-site: only an origin on the allow-list gets through.
    return Boolean(originHost && policy.allowedHosts.includes(originHost))
  }

  if (!origin) return true
  if (!originHost) return false

  const accepted = new Set<string>(policy.allowedHosts)
  for (const h of [headers.get('host'), headers.get('x-forwarded-host')?.split(',')[0]]) {
    const n = normaliseHost(h)
    if (n) accepted.add(n)
  }
  return accepted.has(originHost)
}
