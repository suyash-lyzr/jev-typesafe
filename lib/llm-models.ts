/**
 * The OpenAI models a visitor may compare against, with their list prices.
 *
 * Prices: OpenAI's pricing page (developers.openai.com/api/docs/pricing),
 * standard tier per 1M tokens, checked 2026-09-22. Every model here was called
 * once that day with the exact request shape the comparison sends (Chat
 * Completions + strict JSON schema), and `effort` is the fastest
 * reasoning_effort it accepted — so no attempt is wasted on a value it rejects.
 *
 * Shared by the browser (the picker) and the server (which refuses any id not
 * listed here and charges these prices). Adding a model means re-checking both.
 */

export interface LlmModel {
  id: string
  /** One or two words for the picker. */
  note: string
  inPerM: number
  outPerM: number
  /** Fastest reasoning_effort it accepts; null means it takes no such parameter. */
  effort: 'none' | 'minimal' | 'low' | null
}

export const LLM_PRICES_CHECKED_ON = '2026-09-22'
export const LLM_PRICES_SOURCE = 'https://developers.openai.com/api/docs/pricing'

export const LLM_MODELS: LlmModel[] = [
  { id: 'gpt-5.6-sol', note: 'Large', inPerM: 4, outPerM: 20, effort: 'none' },
  { id: 'gpt-5.6-terra', note: 'Balanced', inPerM: 2, outPerM: 12, effort: 'none' },
  { id: 'gpt-5.6-luna', note: 'Small and fast', inPerM: 0.2, outPerM: 1.2, effort: 'none' },
  { id: 'gpt-5.4-mini', note: 'Small', inPerM: 0.75, outPerM: 4.5, effort: 'none' },
  { id: 'gpt-5.4-nano', note: 'Smallest 5.4', inPerM: 0.2, outPerM: 1.25, effort: 'none' },
  { id: 'o4-mini', note: 'Reasoning', inPerM: 1.1, outPerM: 4.4, effort: 'low' },
  { id: 'gpt-4.1-mini', note: 'No reasoning', inPerM: 0.4, outPerM: 1.6, effort: null },
  { id: 'gpt-4o-mini', note: 'No reasoning, cheapest', inPerM: 0.15, outPerM: 0.6, effort: null },
]

export const DEFAULT_LLM_MODEL = 'gpt-5.6-terra'

export function findLlmModel(id: string | null | undefined): LlmModel | undefined {
  return id ? LLM_MODELS.find((m) => m.id === id) : undefined
}
