import { NextResponse } from 'next/server'
import { OWNER_COOKIE, cookieValueFor } from '@/lib/owner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/owner?token=<COMPARE_OWNER_TOKEN>  → unlimited comparisons in this browser
 * /api/owner?off=1                         → back to the normal quota
 * Either way it lands on /play. A wrong token just redirects, without saying why.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const res = NextResponse.redirect(new URL('/play', url.origin), 303)
  res.headers.set('Cache-Control', 'no-store')

  if (url.searchParams.has('off')) {
    res.cookies.delete(OWNER_COOKIE)
    return res
  }

  const value = cookieValueFor(url.searchParams.get('token'))
  if (value) {
    res.cookies.set(OWNER_COOKIE, value, {
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return res
}
