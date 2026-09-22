import { NextResponse } from 'next/server'
import { callerKey, isSameOrigin } from '@/lib/guards'
import { readQuota } from '@/lib/compare-quota'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** How many free comparisons this network has left today. Reads only; spends nothing. */
export async function GET(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'origin' }, { status: 403 })
  try {
    const quota = await readQuota(callerKey(req.headers))
    return NextResponse.json(quota, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'counters_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
