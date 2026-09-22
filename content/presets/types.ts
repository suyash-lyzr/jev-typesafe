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

/**
 * The one decision a use case's answers feed: what application code would do
 * with them. Shown as the "simulated policy" card — a threshold the reader can
 * drag, re-deciding the cached answer with no API call.
 */
export interface DecisionSpec {
  /** What the code is deciding, e.g. "Route the ticket". */
  title: string
  /** The question whose answer is measured. */
  question: string
  /**
   * P(yes) for a Noul; the Choice/Score confidence; one option's probability;
   * or 'score': a Score's position between its lowest and highest level (0–1).
   */
  measure: 'yes' | 'confidence' | 'score' | { option: string }
  /** Default threshold, 0–1. */
  threshold: number
  /** Names the measured number in the pill: "needs review", "phishing". */
  valueLabel: string
  /** What happens at or above the threshold. */
  above: string
  /** What happens below it. */
  below: string
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
  decision?: DecisionSpec
}

/**
 * TypeSafe's own use-case categories (docs.typesafe.ai/concepts/use-case-map),
 * used to group the playground's use cases.
 */
export type UseCaseGroup = 'automation' | 'realtime' | 'bigdata' | 'verification' | 'harness'

export const USE_CASE_GROUP_LABEL: Record<UseCaseGroup, string> = {
  automation: 'AI automation software',
  realtime: 'Real-time applications',
  bigdata: 'Map-reduce over big data',
  verification: 'Universal verification',
  harness: 'Harness engineering',
}

/** One line each, condensed from the use-case map. */
export const USE_CASE_GROUP_BLURB: Record<UseCaseGroup, string> = {
  automation: 'Code owns the workflow; Jev makes the semantic calls, a million times over.',
  realtime: 'Decisions in about 150 ms — fast enough for games, UIs and control loops.',
  bigdata: 'Cheap enough to classify, rank and extract features across huge datasets.',
  verification: 'Check prompts, answers, tool calls and documents for specific failure modes.',
  harness: 'Make an agent harness smarter: routing, context, next steps and tool choice.',
}

/** The use-case map's "decision shapes". */
export type DecisionShape =
  | 'classification'
  | 'detection'
  | 'scoring'
  | 'routing'
  | 'search'
  | 'retrieval'
  | 'ranking'
  | 'verification'
  | 'feature-extraction'
  | 'structured-extraction'

export const DECISION_SHAPES: Array<{ id: DecisionShape; label: string; when: string; examples: string }> = [
  { id: 'classification', label: 'Classification', when: 'One known category should win', examples: 'Intent, topic, department, risk type, entity type' },
  { id: 'detection', label: 'Detection', when: 'You need a probability that one property is present', examples: 'Spam, fraud, urgency, jailbreaks, sensitive data' },
  { id: 'scoring', label: 'Scoring', when: 'The answer belongs on an ordered rubric', examples: 'Severity, relevance, quality, frustration, suitability' },
  { id: 'routing', label: 'Routing', when: 'A category selects the next code path', examples: 'Tool use, escalation, model routing, support queues' },
  { id: 'search', label: 'Search', when: 'You need to find items that match a natural-language query', examples: 'Semantic search, document discovery, candidate generation' },
  { id: 'retrieval', label: 'Retrieval', when: 'A workflow needs the most relevant context or records', examples: 'RAG context, evidence retrieval, knowledge lookup' },
  { id: 'ranking', label: 'Ranking', when: 'Items need to be ordered by semantic relevance or quality', examples: 'Search results, recommendations, candidate prioritisation' },
  { id: 'verification', label: 'Verification', when: 'An artifact must be checked for specific failure modes', examples: 'Citation support, policy violations, tool-call errors, response quality' },
  { id: 'feature-extraction', label: 'ML feature extraction', when: 'A downstream classical ML model needs semantic signals', examples: 'Purchase intent, product interest, competitive pressure, churn signals' },
  { id: 'structured-extraction', label: 'Structured data extraction', when: 'Known fields must be recovered from unstructured input', examples: 'Candidate attributes, order fields, document labels' },
]

export type PresetCategory =
  | 'usecase'
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
  decision?: DecisionSpec
  /** Use cases only: which of TypeSafe's categories it sits in. */
  group?: UseCaseGroup
  /** Use cases only: the industry, in the use-case map's words. */
  industry?: string
  /** Use cases only: the decision shape it demonstrates. */
  shape?: DecisionShape
  variants: PresetVariant[]
}

export const CATEGORY_LABEL: Record<PresetCategory, string> = {
  usecase: 'Use cases',
  support: 'Support & routing',
  guardrails: 'Guardrails & verification',
  scoring: 'Scoring',
  extraction: 'Extraction',
  limits: 'Limits — things Jev gets wrong on purpose',
}
