import { findLlmModel, LLM_PRICES_CHECKED_ON, LLM_PRICES_SOURCE } from './llm-models'

/**
 * Every price on the site reads from this module, so the playground, the
 * compare page and the cost meter can never drift from each other.
 *
 * Jev: $42 per billion input tokens = $0.042 per million. Output tokens free.
 * Source: docs.typesafe.ai/models, checked 2026-09-21.
 *
 * The OpenAI side is read from the environment on the server only. Client
 * components never read it directly — in the browser those variables are
 * undefined, so they would silently show the defaults instead of what the
 * server actually charged. The compare route returns the prices it used.
 */

/** Empty, zero, negative or non-numeric values fall back instead of disabling the cap. */
function price(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return value !== undefined && value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback
}

export const JEV_PRICING = {
  checkedOn: '2026-09-21',
  inPerM: 0.042,
  outPerM: 0,
  source: 'https://docs.typesafe.ai/models',
} as const

export interface LlmPricing {
  id: string
  inPerM: number
  outPerM: number
  /**
   * The date someone checked these against OpenAI's pricing page, or null.
   * The defaults are TypeSafe's own cookbook assumption for gpt-5.4-mini
   * ("as of 2026-07"), not a price anyone here has confirmed.
   */
  confirmedOn: string | null
  source: string
}

export function llmPricingFromEnv(env: Record<string, string | undefined> = process.env): LlmPricing {
  const confirmed = env.OPENAI_PRICE_CONFIRMED_ON?.trim()
  return {
    id: env.OPENAI_COMPARE_MODEL?.trim() || 'gpt-5.4-mini',
    inPerM: price(env.OPENAI_IN_PER_M, 0.75),
    outPerM: price(env.OPENAI_OUT_PER_M, 4.5),
    confirmedOn: confirmed && /^\d{4}-\d{2}-\d{2}$/.test(confirmed) ? confirmed : null,
    source: confirmed
      ? 'https://openai.com/api/pricing/'
      : "TypeSafe's consistency cookbook assumption (as of 2026-07), not yet confirmed",
  }
}

/** The catalogue's price for a listed model: checked, dated, sourced. */
export function llmPricingFor(id: string): LlmPricing | null {
  const m = findLlmModel(id)
  if (!m) return null
  return { id: m.id, inPerM: m.inPerM, outPerM: m.outPerM, confirmedOn: LLM_PRICES_CHECKED_ON, source: LLM_PRICES_SOURCE }
}

/** Server-side view. Import `JEV_PRICING` rather than this in client components. */
export const PRICING = {
  checkedOn: JEV_PRICING.checkedOn,
  jev: JEV_PRICING,
  get llm(): LlmPricing {
    return llmPricingFromEnv()
  },
}

export function jevCostUsd(inputTokens: number): number {
  return (inputTokens * JEV_PRICING.inPerM) / 1_000_000
}

export function llmCostUsd(promptTokens: number, completionTokens: number, pricing: LlmPricing = PRICING.llm): number {
  return (promptTokens * pricing.inPerM) / 1_000_000 + (completionTokens * pricing.outPerM) / 1_000_000
}

/**
 * Sub-cent costs are the whole point, so never round to two decimals.
 * $0.0000165 reads as "free"; $0.00 reads as a bug.
 */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.000001) return `$${usd.toExponential(2)}`
  if (usd < 0.01) return `$${usd.toFixed(7).replace(/0+$/, '')}`
  return `$${usd.toFixed(4)}`
}

/** "≈ $16.46 per million requests like this one" — the hover on the run strip. */
export function perMillionRequests(usd: number): string {
  return `$${(usd * 1_000_000).toFixed(2)}`
}
