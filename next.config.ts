import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

/**
 * Who may show this site in a frame. Nobody by default; set FRAME_ANCESTORS
 * (space-separated origins, e.g. "https://architect.new") to allow an
 * embedder such as Architect. X-Frame-Options is not sent: it cannot express
 * an allowlist, and frame-ancestors supersedes it in every current browser.
 */
const frameAncestors = process.env.FRAME_ANCESTORS?.trim() || "'none'"

const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; React dev mode also needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Fonts are self-hosted by next/font, so nothing is fetched from Google.
  "font-src 'self'",
  "img-src 'self' data: blob:",
  // Vercel Web Analytics posts to a same-origin path.
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
