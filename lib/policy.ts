import { z } from 'zod'
import type { Answer, Question } from './schema'
import { QUESTION_ID_RE } from './schema'

/**
 * Policy is the part that runs in your code.
 *
 * Every rule here is evaluated against answers the app already has, so moving
 * a threshold re-decides the case without calling the model again. That is the
 * single most important idea the playground has to teach: the model reports a
 * distribution, your code decides what to do about it.
 */

/** Choice and Score: how sure the answer is, as an action. */
export type Band = 'act' | 'review' | 'escalate'

/**
 * Noul: what the probability says, not what to do about it. Whether "yes" is
 * good news depends entirely on the question — a jailbreak Noul at yes should
 * block, a refund Noul at yes should pay — so a confident "no" is reported as
 * "no", never as "escalate". Only the middle goes to a person.
 */
export type NoulVerdict = 'yes' | 'no' | 'unsure'

export type Rule =
  /** Choice and Score: act at or above one confidence, review at or above another. */
  | { q: string; kind: 'band'; act: number; review: number }
  /** Choice: also notify a runner-up that holds a real share of the probability. */
  | { q: string; kind: 'copy_if_p_gt'; threshold: number }
  /** Score: flag when the mean crosses a line. */
  | { q: string; kind: 'flag_if_score_gte'; threshold: number; label: string }
  /** Noul: yes at or above `yes`, no below `no`, a person in between. */
  | { q: string; kind: 'noul'; yes: number; no: number }
  /** Speculative questions: only read this answer when another one landed a given way. */
  | { q: string; kind: 'grey_unless'; dependsOn: string; equals: string[] }

export interface Policy {
  rules: Rule[]
}

/**
 * Policies arrive from share links, so they are validated like any other
 * untrusted input. Thresholds are numbers in range; ids match the question-id
 * alphabet; labels are short plain text.
 */
const unit = z.number().finite().min(0).max(1)
const id = z.string().regex(QUESTION_ID_RE)

export const RuleSchema = z.discriminatedUnion('kind', [
  z.object({ q: id, kind: z.literal('band'), act: unit, review: unit }),
  z.object({ q: id, kind: z.literal('copy_if_p_gt'), threshold: unit }),
  z.object({
    q: id,
    kind: z.literal('flag_if_score_gte'),
    threshold: z.number().finite().min(0).max(10),
    label: z.string().max(60).regex(/^[\w .,'()-]*$/),
  }),
  z.object({ q: id, kind: z.literal('noul'), yes: unit, no: unit }),
  z.object({ q: id, kind: z.literal('grey_unless'), dependsOn: id, equals: z.array(z.string().max(64)).max(255) }),
])

export const PolicySchema = z.object({ rules: z.array(RuleSchema).max(400) })

export interface PolicyOutcome {
  bands: Record<string, Band>
  nouls: Record<string, NoulVerdict>
  /** Answers the policy says are irrelevant on this path. */
  greyed: string[]
  /** One plain-English line per decision, in question order. */
  lines: string[]
}

export const DEFAULT_ACT = 0.85
export const DEFAULT_REVIEW = 0.5
export const DEFAULT_NOUL_YES = 0.8
export const DEFAULT_NOUL_NO = 0.2

interface PolicyPreset {
  label: string
  note: string
  source: string
  /** Choice/Score thresholds. */
  band: { act: number; review: number }
  /** Noul thresholds, when the preset has an opinion about Nouls. */
  noul?: { yes: number; no: number }
}

/**
 * Named starting points, each from a documented example. Applying one changes
 * thresholds only: copy, flag and speculative rules are kept, and Noul rules
 * stay Noul rules.
 */
export const POLICY_PRESETS: Record<string, PolicyPreset> = {
  readonly: {
    label: 'Read-only action · 0.6',
    note: 'A low-stakes action: 0.6 is enough, and anything below it goes to a person.',
    source: 'docs.typesafe.ai/patterns/confidence-routing',
    band: { act: 0.6, review: 0.6 },
  },
  money: {
    label: 'Money moves · 0.9',
    note: 'Act above 0.9; between 0.5 and 0.9 ask the person to confirm; below 0.5 send to a person.',
    source: 'docs.typesafe.ai/confidence',
    band: { act: 0.9, review: 0.5 },
  },
  strict: {
    label: 'Guardrail · strict',
    note: 'Review at 0.35, act at 0.70.',
    source: 'docs.typesafe.ai/cookbooks/llm_guardrails',
    band: { act: 0.7, review: 0.35 },
    noul: { yes: 0.7, no: 0.35 },
  },
  permissive: {
    label: 'Guardrail · permissive',
    note: 'Same probabilities, a higher bar to act: 0.85.',
    source: 'docs.typesafe.ai/cookbooks/llm_guardrails',
    band: { act: 0.85, review: 0.35 },
    noul: { yes: 0.85, no: 0.35 },
  },
}

export function applyPolicyPreset(policy: Policy, preset: PolicyPreset, questions: Record<string, Question>): Policy {
  const covered = new Set(policy.rules.filter((r) => r.kind === 'band' || r.kind === 'noul').map((r) => r.q))

  const rules: Rule[] = policy.rules.map((r) => {
    if (r.kind === 'band') return { ...r, ...preset.band }
    if (r.kind === 'noul' && preset.noul) return { ...r, ...preset.noul }
    return r
  })

  // Questions with no threshold rule yet get one of the right kind.
  for (const [qid, q] of Object.entries(questions)) {
    if (covered.has(qid)) continue
    rules.push(
      q.type === 'noul'
        ? { q: qid, kind: 'noul', ...(preset.noul ?? { yes: DEFAULT_NOUL_YES, no: DEFAULT_NOUL_NO }) }
        : { q: qid, kind: 'band', ...preset.band }
    )
  }
  return { rules }
}

export function defaultPolicy(questions: Record<string, Question>): Policy {
  const rules: Rule[] = []
  for (const [qid, q] of Object.entries(questions)) {
    rules.push(
      q.type === 'noul'
        ? { q: qid, kind: 'noul', yes: DEFAULT_NOUL_YES, no: DEFAULT_NOUL_NO }
        : { q: qid, kind: 'band', act: DEFAULT_ACT, review: DEFAULT_REVIEW }
    )
  }
  return { rules }
}

/**
 * Rules are keyed by the editor's question id. When a question carries an A/B
 * variant its answers arrive as `<id>__A` and `<id>__B`, and the rule follows
 * variant A. Returns the key to read, or null when the question is gone.
 */
export function resolveRuleTarget(qid: string, keyed: Record<string, unknown>): string | null {
  if (Object.hasOwn(keyed, qid)) return qid
  if (Object.hasOwn(keyed, `${qid}__A`)) return `${qid}__A`
  return null
}

function bandFor(value: number, act: number, review: number): Band {
  if (value >= act) return 'act'
  if (value >= review) return 'review'
  return 'escalate'
}

export function noulVerdict(value: number, yes: number, no: number): NoulVerdict {
  if (value >= yes) return 'yes'
  if (value < no) return 'no'
  return 'unsure'
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Pure, and deliberately so: the Policy tab calls this on every slider frame
 * against the cached response, which is what makes "0 API calls" true.
 *
 * Outcomes are keyed by the editor's question id, so an A/B question gets its
 * band on the card that shows both variants.
 */
export function evaluatePolicy(
  policy: Policy,
  answers: Record<string, Answer>,
  _questions: Record<string, Question> = {}
): PolicyOutcome {
  // Null-prototype maps: a question id like "constructor" must not read an
  // inherited value.
  const bands: Record<string, Band> = Object.create(null)
  const nouls: Record<string, NoulVerdict> = Object.create(null)
  const greyed: string[] = []
  const lines: string[] = []

  const answerFor = (qid: string): Answer | undefined => {
    const key = resolveRuleTarget(qid, answers)
    return key ? answers[key] : undefined
  }

  for (const rule of policy.rules) {
    const answer = answerFor(rule.q)
    if (!answer) continue
    if (rule.kind === 'band' && answer.type !== 'noul') bands[rule.q] = bandFor(answer.confidence, rule.act, rule.review)
    if (rule.kind === 'noul' && answer.type === 'noul') nouls[rule.q] = noulVerdict(answer.noul, rule.yes, rule.no)
  }

  for (const rule of policy.rules) {
    const answer = answerFor(rule.q)
    if (!answer) continue

    switch (rule.kind) {
      case 'band': {
        if (answer.type === 'noul') break
        const band = bands[rule.q]
        const label = answer.type === 'choice' ? `"${answer.choice}"` : answer.score.toFixed(2)
        const c = answer.confidence.toFixed(2)
        lines.push(
          band === 'act'
            ? `${rule.q} → act on ${label} (confidence ${c} ≥ ${rule.act}).`
            : band === 'review'
              ? `${rule.q} → review ${label} (confidence ${c} is below ${rule.act}).`
              : `${rule.q} → send to a person: confidence ${c} is below ${rule.review}.`
        )
        break
      }

      case 'copy_if_p_gt': {
        if (answer.type !== 'choice') break
        const others = Object.entries(answer.probabilities)
          .filter(([key, p]) => key !== answer.choice && p > rule.threshold)
          .sort((a, b) => b[1] - a[1])
        for (const [key, p] of others) {
          lines.push(`${rule.q} → also notify "${key}" (${pct(p)} > ${pct(rule.threshold)}).`)
        }
        break
      }

      case 'flag_if_score_gte': {
        if (answer.type !== 'score') break
        if (answer.score >= rule.threshold) {
          lines.push(`${rule.q} → ${rule.label} (score ${answer.score.toFixed(2)} ≥ ${rule.threshold}).`)
        }
        break
      }

      case 'noul': {
        if (answer.type !== 'noul') break
        const v = answer.noul.toFixed(2)
        const verdict = nouls[rule.q]
        lines.push(
          verdict === 'yes'
            ? `${rule.q} → yes (${v} ≥ ${rule.yes}).`
            : verdict === 'no'
              ? `${rule.q} → no (${v} < ${rule.no}).`
              : `${rule.q} → send to a person: ${v} sits between ${rule.no} and ${rule.yes}.`
        )
        break
      }

      case 'grey_unless': {
        const dep = answerFor(rule.dependsOn)
        // A dependency that is not in the answers greys nothing: otherwise
        // deleting a question would hide its dependants for good.
        if (!dep) break
        const matches = dep.type === 'choice' && rule.equals.includes(dep.choice)
        if (!matches) greyed.push(rule.q)
        break
      }
    }
  }

  return { bands, nouls, greyed, lines }
}

export function bandLabel(band: Band): string {
  return band === 'act' ? 'Act' : band === 'review' ? 'Review' : 'Escalate'
}

export function noulLabel(verdict: NoulVerdict): string {
  return verdict === 'yes' ? 'Yes' : verdict === 'no' ? 'No' : 'Unsure'
}

/** Rules follow their questions: gone questions take their rules — and their dependants' conditions — with them. */
export function reconcilePolicy(policy: Policy, questionIds: string[]): Policy {
  const live = new Set(questionIds)
  return {
    rules: policy.rules.filter((r) => live.has(r.q) && (r.kind !== 'grey_unless' || live.has(r.dependsOn))),
  }
}

export function renameInPolicy(policy: Policy, from: string, to: string): Policy {
  return {
    rules: policy.rules.map((r) => {
      const next = { ...r, q: r.q === from ? to : r.q }
      if (next.kind === 'grey_unless' && next.dependsOn === from) next.dependsOn = to
      return next
    }),
  }
}
