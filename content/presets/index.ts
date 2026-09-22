import type { Preset, PresetVariant } from './types'
import type { LoadInput } from '@/lib/store'
import { defaultPolicy } from '@/lib/policy'
import { requestHash } from '@/lib/serialize'
import type { Answer, Question } from '@/lib/schema'
import { OWN_RECORDINGS } from '../recorded/presets'

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
import { useCases } from './use-cases'

export { USE_CASE_SLUGS, USE_CASE_GROUPS } from './use-cases'

export * from './types'

/** Gallery order: the everyday use cases first, then the docs' own examples, then limits. */
const authored: Preset[] = [
  ...useCases,
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

/**
 * Where the docs publish no numbers, a variant can still replay a response
 * Jev Lab recorded itself (scripts/record-presets.ts) — labelled as ours, never
 * as the docs'. A recording is only used while its request is byte-for-byte
 * the one the variant sends now; edit the preset and the stale recording is
 * simply ignored until it is re-recorded.
 */
function withOwnRecordings(preset: Preset): Preset {
  return {
    ...preset,
    variants: preset.variants.map((variant) => {
      if (variant.recorded) return variant
      const own = OWN_RECORDINGS.find((r) => r.preset === preset.slug && r.variant === variant.id)
      if (!own) return variant
      const questions = variant.questions ?? preset.questions
      const matches =
        requestHash({ state: variant.state, questions }) ===
        requestHash({ state: own.request.state as never, questions: own.request.questions as Record<string, Question> })
      if (!matches) return variant
      return {
        ...variant,
        recorded: {
          source: 'Jev Lab (our own live run)',
          model: own.model,
          date: own.recordedAt.slice(0, 10),
          answers: own.answers as Record<string, Answer>,
          usage: own.usage,
          note: 'The docs publish no numbers for this one, so this is a single run Jev Lab recorded itself — one answer, not a benchmark.',
        },
      }
    }),
  }
}

export const allPresets: Preset[] = authored.map(withOwnRecordings)

export function getPreset(slug: string): Preset | null {
  return allPresets.find((p) => p.slug === slug) ?? null
}

export function getVariant(preset: Preset, variantId?: string): PresetVariant {
  if (!variantId) return preset.variants[0]
  return preset.variants.find((v) => v.id === variantId) ?? preset.variants[0]
}

/**
 * A preset becomes editor state. A recorded response is shown straight away so
 * the reader sees a real answer before spending anything — labelled as a
 * replay, with its source, model and date, and with no invented timing or
 * cost: nothing was timed and it cost this site nothing.
 */
export function presetToLoad(
  preset: Preset,
  variantId?: string,
  opts: { compare?: boolean } = {}
): LoadInput {
  const variant = getVariant(preset, variantId)
  const questions = variant.questions ?? preset.questions
  const policy = variant.policy ?? preset.policy ?? defaultPolicy(questions)
  const rec = variant.recorded

  return {
    state: variant.state,
    stateMode: typeof variant.state === 'string' ? 'text' : 'json',
    questions,
    policy,
    title: preset.variants.length > 1 ? `${preset.title} · ${variant.label}` : preset.title,
    presetId: preset.slug,
    variantId: variant.id,
    compare: opts.compare,
    recorded: rec
      ? {
          answers: rec.answers,
          request: { state: variant.state, model: rec.model, questions },
          model: rec.model,
          usage: rec.usage ?? null,
          timing: null,
          clientMs: null,
          costUsd: null,
          replay: true,
          provenance: { source: rec.source, model: rec.model, date: rec.date, note: rec.note },
          hash: '',
        }
      : null,
  }
}

export const presetsByCategory = allPresets.reduce<Record<string, Preset[]>>((acc, preset) => {
  ;(acc[preset.category] ??= []).push(preset)
  return acc
}, {})
