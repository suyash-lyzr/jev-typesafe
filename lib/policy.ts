import type { Answer, Question } from './schema'

/**
 * Policy is the part that runs in your code.
 *
 * Every rule here is evaluated against answers the app already has, so moving
 * a threshold re-decides the case without calling the model again. That is the
 * single most important idea the playground has to teach: the model reports a
 * distribution, your code decides what to do about it.
 */

export type Band = 'act' | 'review' | 'escalate'

export type Rule =
  /** Choice and Score: act above one confidence, review above another. */
  | { q: string; kind: 'band'; act: number; review: number }
  /** Choice: also notify a runner-up that holds a real share of the probability. */
  | { q: string; kind: 'copy_if_p_gt'; threshold: number }
  /** Score: flag when the mean crosses a line. */
  | { q: string; kind: 'flag_if_score_gte'; threshold: number; label: string }
  /** Noul: a yes/no band with a middle that goes to a person. */
  | { q: string; kind: 'noul'; yes: number; no: number }
  /** Speculative questions: only read this answer when another one landed a given way. */
  | { q: string; kind: 'grey_unless'; dependsOn: string; equals: string[] }

export interface Policy {
  rules: Rule[]
}

export interface PolicyOutcome {
  bands: Record<string, Band>
  /** Answers the policy says are irrelevant on this path. */
  greyed: string[]
  /** One plain-English line per decision, in question order. */
  lines: string[]
}

export const DEFAULT_ACT = 0.85
export const DEFAULT_REVIEW = 0.5
export const DEFAULT_NOUL_YES = 0.8
export const DEFAULT_NOUL_NO = 0.2

/** Named starting points, each taken from a documented example. */
export const POLICY_PRESETS: Record<string, { label: string; note: string; make: (ids: string[]) => Rule[] }> = {
  readonly: {
    label: 'Read-only action · 0.6',
    note: 'Showing the wrong screen is recoverable, so a lower bar is fine.',
    make: (ids) => ids.map((q) => ({ q, kind: 'band', act: 0.6, review: 0.4 })),
  },
  money: {
    label: 'Money moves · 0.9',
    note: 'Approving a transfer needs near-certainty; below it, ask the person to confirm.',
    make: (ids) => ids.map((q) => ({ q, kind: 'band', act: 0.9, review: 0.6 })),
  },
  strict: {
    label: 'Guardrail · strict',
    note: 'Review at 0.35, act at 0.70.',
    make: (ids) => ids.map((q) => ({ q, kind: 'band', act: 0.7, review: 0.35 })),
  },
  permissive: {
    label: 'Guardrail · permissive',
    note: 'Same probabilities, a higher bar to act: 0.85.',
    make: (ids) => ids.map((q) => ({ q, kind: 'band', act: 0.85, review: 0.35 })),
  },
}

export function defaultPolicy(questions: Record<string, Question>): Policy {
  const rules: Rule[] = []
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === 'noul') {
      rules.push({ q: id, kind: 'noul', yes: DEFAULT_NOUL_YES, no: DEFAULT_NOUL_NO })
    } else {
      rules.push({ q: id, kind: 'band', act: DEFAULT_ACT, review: DEFAULT_REVIEW })
    }
  }
  return { rules }
}

function bandFor(value: number, act: number, review: number): Band {
  if (value >= act) return 'act'
  if (value >= review) return 'review'
  return 'escalate'
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Pure, and deliberately so: the Policy tab calls this on every slider frame
 * against the cached response, which is what makes "0 API calls" true.
 */
export function evaluatePolicy(
  policy: Policy,
  answers: Record<string, Answer>,
  questions: Record<string, Question> = {}
): PolicyOutcome {
  const bands: Record<string, Band> = {}
  const greyed: string[] = []
  const lines: string[] = []

  // Bands first: later rules read them.
  for (const rule of policy.rules) {
    const answer = answers[rule.q]
    if (!answer) continue

    if (rule.kind === 'band' && answer.type !== 'noul') {
      bands[rule.q] = bandFor(answer.confidence, rule.act, rule.review)
    }
    if (rule.kind === 'noul' && answer.type === 'noul') {
      bands[rule.q] =
        answer.noul >= rule.yes ? 'act' : answer.noul <= rule.no ? 'escalate' : 'review'
    }
  }

  for (const rule of policy.rules) {
    const answer = answers[rule.q]
    if (!answer) continue

    switch (rule.kind) {
      case 'band': {
        if (answer.type === 'noul') break
        const band = bands[rule.q]
        const label = answer.type === 'choice' ? answer.choice : answer.score.toFixed(2)
        lines.push(
          band === 'act'
            ? `${rule.q} → act on "${label}" (confidence ${answer.confidence.toFixed(2)} ≥ ${rule.act}).`
            : band === 'review'
              ? `${rule.q} → review "${label}" (confidence ${answer.confidence.toFixed(2)} below ${rule.act}).`
              : `${rule.q} → escalate: confidence ${answer.confidence.toFixed(2)} is under ${rule.review}.`
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
        const v = answer.noul
        lines.push(
          v >= rule.yes
            ? `${rule.q} → yes (${v.toFixed(2)} ≥ ${rule.yes}).`
            : v <= rule.no
              ? `${rule.q} → no (${v.toFixed(2)} ≤ ${rule.no}).`
              : `${rule.q} → send to a person: ${v.toFixed(2)} sits between ${rule.no} and ${rule.yes}.`
        )
        break
      }

      case 'grey_unless': {
        const dep = answers[rule.dependsOn]
        const matches = dep?.type === 'choice' && rule.equals.includes(dep.choice)
        if (!matches) {
          greyed.push(rule.q)
        }
        break
      }
    }
  }

  return { bands, greyed, lines }
}

export function bandLabel(band: Band): string {
  return band === 'act' ? 'Act' : band === 'review' ? 'Review' : 'Escalate'
}

/** Rules follow renames, and disappear when their question does. */
export function reconcilePolicy(policy: Policy, questionIds: string[]): Policy {
  const live = new Set(questionIds)
  return { rules: policy.rules.filter((r) => live.has(r.q)) }
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
