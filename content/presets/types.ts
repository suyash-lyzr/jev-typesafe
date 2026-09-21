import type { Answer, Question, State } from '@/lib/schema'
import type { Policy } from '@/lib/policy'

/**
 * A preset is a real request somebody can edit, not a screenshot.
 *
 * Variants are first-class: a variant may change the state, override or replace
 * the questions, carry its own policy, and bring its own recorded response. The
 * support-triage clear/ambiguous pair and the guardrail input/output batteries
 * both need that, and a flat "one state per preset" shape cannot express them.
 */

export interface RecordedRun {
  /** Where the numbers came from: a docs page, or "ours" when we recorded them. */
  source: string
  /** The model that answered. Aliases move, so this is always the versioned id. */
  model: string
  /**
   * ISO date. For a cookbook this is the date the cookbook states it was
   * recorded; the primitive pages print no date, so for those it is the date
   * the page was read.
   */
  date: string
  answers: Record<string, Answer>
  usage?: { input_tokens: number; output_tokens: number }
  note?: string
}

export interface PresetVariant {
  id: string
  label: string
  description: string
  state: State
  /** Replaces the preset's questions entirely when present. */
  questions?: Record<string, Question>
  policy?: Policy
  /** null means "deliberately not recorded yet"; undefined means nobody looked. */
  recorded?: RecordedRun | null
}

export type PresetCategory =
  | 'support'
  | 'guardrails'
  | 'scoring'
  | 'extraction'
  | 'limits'

export interface Preset {
  slug: string
  title: string
  category: PresetCategory
  /** One line, in the gallery card. */
  teaches: string
  /** Documented patterns this demonstrates, e.g. "speculative fan-out". */
  patterns: string[]
  questions: Record<string, Question>
  policy?: Policy
  variants: PresetVariant[]
}

export const CATEGORY_LABEL: Record<PresetCategory, string> = {
  support: 'Support & routing',
  guardrails: 'Guardrails & verification',
  scoring: 'Scoring',
  extraction: 'Extraction',
  limits: 'Limits — things Jev gets wrong on purpose',
}
