import { NextResponse } from 'next/server'
import { budgetState, LIMITS } from '@/lib/guards'
import { PRICING } from '@/lib/pricing'
import { DEFAULT_MODEL, KNOWN_MODELS } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Global fields only, so the CDN can absorb every open tab's polling.
 *
 * Jev and the comparison are reported separately: when the OpenAI budget runs
 * out, comparisons stop but Jev runs do not, and the banner must not claim the
 * whole site is paused. The LLM prices come from here rather than from the
 * client bundle, where the server's environment is not visible.
 */
export async function GET() {
  const { state, compare, resetsAt } = await budgetState()
  const llm = PRICING.llm

  return NextResponse.json(
    {
      budget: state,
      compareBudget: compare,
      resetsAt,
      model: DEFAULT_MODEL,
      models: KNOWN_MODELS,
      pricing: {
        checkedOn: PRICING.checkedOn,
        jevInPerM: PRICING.jev.inPerM,
        llm: { id: llm.id, inPerM: llm.inPerM, outPerM: llm.outPerM, confirmedOn: llm.confirmedOn },
      },
      compareAvailable: Boolean(process.env.OPENAI_API_KEY),
      limits: {
        playPerMinute: LIMITS.play.perMinute,
        playPerDay: LIMITS.play.perDay,
        comparePerMinute: LIMITS.compare.perMinute,
        comparePerDay: LIMITS.compare.perDay,
      },
    },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
  )
}
