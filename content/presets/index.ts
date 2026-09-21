import type { Preset, PresetVariant } from './types'
import type { LoadInput } from '@/lib/store'
import { defaultPolicy } from '@/lib/policy'

import { firstRun } from './first-run'
import { supportTriage } from './support-triage'
import { voiceBanking } from './voice-banking'
import { modelRouting } from './model-routing'
import { smartHome } from './smart-home'
import { llmGuardrail } from './llm-guardrail'
import { citationCheck } from './citation-check'
import { ragPassageGate } from './rag-passage-gate'
import { bugSeverity } from './bug-severity'
import { resumeScreening } from './resume-screening'
import { dateExtraction } from './date-extraction'
import { limitsPresets } from './limits'

export * from './types'

/** Gallery order: the first-run request first, then by how much setup each needs. */
export const allPresets: Preset[] = [
  firstRun,
  supportTriage,
  voiceBanking,
  modelRouting,
  smartHome,
  llmGuardrail,
  citationCheck,
  ragPassageGate,
  bugSeverity,
  resumeScreening,
  dateExtraction,
  ...limitsPresets,
]

export function getPreset(slug: string): Preset | null {
  return allPresets.find((p) => p.slug === slug) ?? null
}

export function getVariant(preset: Preset, variantId?: string): PresetVariant {
  if (!variantId) return preset.variants[0]
  return preset.variants.find((v) => v.id === variantId) ?? preset.variants[0]
}

/**
 * A preset becomes editor state. A recorded response is shown straight away so
 * the reader sees a real answer before spending anything — and it is labelled
 * as a replay, never passed off as a live run.
 */
export function presetToLoad(preset: Preset, variantId?: string): LoadInput {
  const variant = getVariant(preset, variantId)
  const questions = variant.questions ?? preset.questions
  const policy = variant.policy ?? preset.policy ?? defaultPolicy(questions)

  return {
    state: variant.state,
    stateMode: typeof variant.state === 'string' ? 'text' : 'json',
    questions,
    policy,
    title: `${preset.title} · ${variant.label}`,
    presetId: preset.slug,
    variantId: variant.id,
    recorded: variant.recorded
      ? {
          answers: variant.recorded.answers,
          request: { state: variant.state, model: variant.recorded.model, questions },
          model: variant.recorded.model,
          usage: variant.recorded.usage ?? { input_tokens: 0, output_tokens: 0 },
          timing: { jevMs: 0, serverMs: 0, retries: 0 },
          clientMs: 0,
          costUsd: 0,
          replay: true,
          hash: '',
        }
      : null,
  }
}

export const presetsByCategory = allPresets.reduce<Record<string, Preset[]>>((acc, preset) => {
  ;(acc[preset.category] ??= []).push(preset)
  return acc
}, {})
