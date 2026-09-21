import { NextResponse } from 'next/server'
import { budgetState, LIMITS } from '@/lib/guards'
import { PRICING } from '@/lib/pricing'
import { DEFAULT_MODEL } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Global fields only. Per-IP remaining/reset ride back as headers on the run
 * responses instead, so this stays cacheable: every open tab polls it, and
 * per-caller data here would force a Redis read per poll.
 */
export async function GET() {
  const { state, resetsAt } = await budgetState()

  return NextResponse.json(
    {
      budget: state,
      resetsAt,
      model: DEFAULT_MODEL,
      pricing: {
        checkedOn: PRICING.checkedOn,
        jevInPerM: PRICING.jev.inPerM,
        llm: PRICING.llm.id,
      },
      limits: {
        playPerMinute: LIMITS.play.perMinute,
        playPerDay: LIMITS.play.perDay,
        comparePerMinute: LIMITS.compare.perMinute,
        comparePerDay: LIMITS.compare.perDay,
      },
    },
    {
      headers: {
        // The CDN absorbs the polling.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    }
  )
}
