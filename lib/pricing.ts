/**
 * Every price on the site reads from this module, so the playground, the
 * compare page and the cost meter can never drift from each other.
 *
 * Jev: $42 per billion input tokens = $0.042 per million. Output tokens free.
 * Source: docs.typesafe.ai/models, checked 2026-09-21.
 */

export const PRICING = {
  checkedOn: '2026-09-21',
  jev: {
    inPerM: 0.042,
    outPerM: 0,
    source: 'https://docs.typesafe.ai/models',
  },
  /**
   * The compare opponent. The id and both prices MUST be confirmed against
   * OpenAI's pricing page before launch — see the plan's open items. Nothing
   * else in the app hardcodes them.
   */
  llm: {
    id: process.env.OPENAI_COMPARE_MODEL ?? 'gpt-5.4-mini',
    inPerM: Number(process.env.OPENAI_IN_PER_M ?? 0.75),
    outPerM: Number(process.env.OPENAI_OUT_PER_M ?? 4.5),
    source: 'https://openai.com/api/pricing/ — confirm before launch',
  },
} as const

export function jevCostUsd(inputTokens: number): number {
  return (inputTokens * PRICING.jev.inPerM) / 1_000_000
}

export function llmCostUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens * PRICING.llm.inPerM) / 1_000_000 +
    (completionTokens * PRICING.llm.outPerM) / 1_000_000
  )
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
