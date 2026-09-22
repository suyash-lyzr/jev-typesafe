import {
  ADVISED_MIN_CHOICE_OPTIONS,
  ADVISED_MIN_SCORE_LEVELS,
  MAX_CHOICE_OPTIONS,
  MAX_SCORE_LEVELS,
  TOKEN_BUDGET_STATE,
  TOKEN_BUDGET_TOTAL,
  estimateTokens,
  approxTokens,
  noulHasContent,
  isEditorQuestionId,
  stateChars,
} from './schema'
import type { Question, State } from './schema'

/**
 * The documented mistakes, caught before the request.
 *
 * Every rule here comes from a specific page — the jaggedness guide, the
 * primitive pages, or the models page — and links back to where the reader can
 * see why. A rule either blocks (the API or the docs say it cannot work) or
 * warns (it will run, but the answer will be worth less).
 */

export type LintSeverity = 'block' | 'warn' | 'info'

export interface Lint {
  id: string
  questionId?: string
  severity: LintSeverity
  message: string
  /** Applied by the store when the reader clicks the fix. */
  fix?: { label: string; kind: LintFixKind }
  learnHref?: string
}

export type LintFixKind =
  | { type: 'add-escape-option'; questionId: string }
  | { type: 'trim-levels'; questionId: string }
  | { type: 'split-noul'; questionId: string }

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-(?:proj-|live_|test_)?(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/, 'an OpenAI- or Stripe-style secret key'],
  [/\bAKIA[0-9A-Z]{12,}/, 'an AWS access key id'],
  [/\bghp_[A-Za-z0-9]{20,}/, 'a GitHub token'],
  [/\bxox[bpsa]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bapikey_[A-Za-z0-9]{20,}/, 'a TypeSafe API key'],
]

/** Digit runs that pass Luhn only *warn*: order and invoice numbers look alike. */
function looksLikeCardNumber(text: string): boolean {
  for (const match of text.matchAll(/\b\d[\d ]{11,21}\d\b/g)) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length < 13 || digits.length > 19) continue

    let sum = 0
    let double = false
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48
      if (double) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
      double = !double
    }
    if (sum % 10 === 0) return true
  }
  return false
}

/** Levels described only by numbers give the model nothing to match against. */
function isBareNumericLevels(criteria: unknown[]): boolean {
  const strings = criteria.filter((c): c is string => typeof c === 'string')
  if (strings.length !== criteria.length || strings.length === 0) return false
  return strings.every((s) => /^\s*-?\d+(\.\d+)?\s*$/.test(s))
}

function instructionsText(instructions: unknown): string {
  if (typeof instructions === 'string') return instructions
  if (instructions && typeof instructions === 'object') return JSON.stringify(instructions)
  return ''
}

/** Backticked dot-and-index paths: `ticket.messages[0].text` */
function backtickPaths(text: string): string[] {
  return [...text.matchAll(/`([A-Za-z_][\w.\[\]]*)`/g)].map((m) => m[1])
}

function resolvePath(state: unknown, path: string): boolean {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let node: any = state
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return false
    node = node[part]
    if (node === undefined) return false
  }
  return true
}

export function lintRequest(
  state: State,
  questions: Record<string, Question>,
  variants: Record<string, Question> = {}
): Lint[] {
  const lints: Lint[] = []
  const stateText = typeof state === 'string' ? state : JSON.stringify(state)

  // --- state -------------------------------------------------------------

  for (const [pattern, what] of SECRET_PATTERNS) {
    if (pattern.test(stateText)) {
      lints.push({
        id: 'secret',
        severity: 'block',
        message: `The state contains what looks like ${what}. Remove it before running — this text is sent to TypeSafe.`,
      })
      break
    }
  }

  if (looksLikeCardNumber(stateText)) {
    lints.push({
      id: 'card-number',
      severity: 'warn',
      message:
        'A number in the state looks like a payment card. If it is an order or invoice number, carry on.',
    })
  }

  if (stateChars(state) > 8_000) {
    lints.push({
      id: 'large-state',
      severity: 'warn',
      message:
        'Accuracy falls as the state grows with detail unrelated to the decision. Send only the fields the questions need.',
      learnHref: '/limits#big-state',
    })
  }

  const stateTokens = estimateTokens(state)
  if (stateTokens > TOKEN_BUDGET_STATE) {
    lints.push({
      id: 'state-budget',
      severity: 'block',
      message: `The state is about ${approxTokens(state).toLocaleString()} tokens; Jev allows ${TOKEN_BUDGET_STATE.toLocaleString()} for the state plus the longest question.`,
    })
  }

  // The docs call out CJK as handled but less accurate than English; other
  // non-Latin scripts get the same caution, since only English is claimed.
  const nonLatin = (
    stateText.match(
      /[\u3000-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\uff00-\uffef]/g
    ) ?? []
  ).length
  if (stateText.length > 40 && nonLatin / stateText.length > 0.3) {
    lints.push({
      id: 'non-latin',
      severity: 'info',
      message:
        'TypeSafe says English is where Jev is most accurate, and that CJK is handled but not equally well. Watch confidence closely.',
    })
  }

  // --- questions ---------------------------------------------------------

  const allQuestions = Object.entries(questions)
  if (allQuestions.length === 0) {
    lints.push({ id: 'no-questions', severity: 'block', message: 'Ask at least one question.' })
  }

  let totalTokens = stateTokens

  // Every question, and every B variant beside it: a variant travels in the
  // same request, so an empty or oversized one fails the whole run.
  const targets: Array<{ id: string; q: Question; label: string; isVariant: boolean }> = []
  for (const [id, q] of allQuestions) {
    targets.push({ id, q, label: id, isVariant: false })
    if (Object.hasOwn(variants, id)) targets.push({ id, q: variants[id], label: `${id} (variant B)`, isVariant: true })

    if (!isEditorQuestionId(id)) {
      lints.push({
        id: 'bad-id',
        questionId: id,
        severity: 'block',
        message: /__[AB]$/.test(id)
          ? `"${id}" ends in __A or __B, which the A/B mechanism reserves. Rename it.`
          : `"${id}" is not a valid question id. Use letters, digits, _ or -, up to 64 characters.`,
      })
    }
  }

  for (const { id, q, label, isVariant } of targets) {
    totalTokens += estimateTokens(q)
    const text = instructionsText(q.instructions)

    if (q.type !== 'noul' && !text.trim()) {
      lints.push({
        id: 'empty-instructions',
        questionId: id,
        severity: 'block',
        message: `${label} has no instructions. The question ids are never sent to the model, so the instruction carries the whole question.`,
      })
    }

    if (q.type === 'noul' && !noulHasContent(q)) {
      lints.push({
        id: 'empty-noul',
        questionId: id,
        severity: 'block',
        message: `${label} needs instructions or true/false criteria.`,
      })
    }

    // Paths only resolve against a structured state.
    if (typeof state !== 'string') {
      for (const path of backtickPaths(text)) {
        if (!resolvePath(state, path)) {
          lints.push({
            id: 'unresolved-path',
            questionId: id,
            severity: 'warn',
            message: `${label} points at \`${path}\`, which is not in the state.`,
          })
        }
      }
    }

    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria)

      if (keys.length > MAX_CHOICE_OPTIONS) {
        lints.push({
          id: 'too-many-options',
          questionId: id,
          severity: 'block',
          message: `${label} has ${keys.length} options. Too many choices. Must have at most ${MAX_CHOICE_OPTIONS} choices.`,
        })
      } else if (keys.length > 240) {
        lints.push({
          id: 'many-options',
          questionId: id,
          severity: 'info',
          message: `${label} has ${keys.length} options. The docs call a Choice reliable to around 240.`,
        })
      }

      if (keys.length < ADVISED_MIN_CHOICE_OPTIONS) {
        lints.push({
          id: 'one-option',
          questionId: id,
          severity: 'warn',
          message: `${label} has a single option, so it can only return that option at probability 1.0. The API accepts it; it just cannot tell you anything.`,
        })
      }

      const hasEscape = keys.some((k) => /^(other|none|none_of_the_above|unknown|unclear)$/i.test(k))
      if (!hasEscape && keys.length >= ADVISED_MIN_CHOICE_OPTIONS) {
        lints.push({
          id: 'no-escape-option',
          questionId: id,
          severity: 'warn',
          message: `${label} has no escape option. Probabilities always sum to 1, so without one the model must pick a listed option even when none fits.`,
          fix: isVariant ? undefined : { label: 'Add "other"', kind: { type: 'add-escape-option', questionId: id } },
          learnHref: '/learn/choice',
        })
      }
    }

    if (q.type === 'score') {
      const levels = q.criteria

      if (levels.length > MAX_SCORE_LEVELS) {
        lints.push({
          id: 'too-many-levels',
          questionId: id,
          severity: 'block',
          message: `${label} has ${levels.length} levels. Too many score levels. Must have at most ${MAX_SCORE_LEVELS} levels.`,
          fix: isVariant ? undefined : { label: `Keep the first ${MAX_SCORE_LEVELS}`, kind: { type: 'trim-levels', questionId: id } },
        })
      }

      if (levels.length < ADVISED_MIN_SCORE_LEVELS) {
        lints.push({
          id: 'one-level',
          questionId: id,
          severity: 'warn',
          message: `${label} has a single level, so the score can only be 0.0. The API accepts it; it just cannot place anything.`,
        })
      }

      if (isBareNumericLevels(levels)) {
        lints.push({
          id: 'numeric-levels',
          questionId: id,
          severity: 'warn',
          message: `${label} describes its levels with numbers. Each level is judged on its own, so "2 is worst" means nothing to the model — describe the situation instead.`,
          learnHref: '/limits#numeric-levels',
        })
      }
    }

    if (q.type === 'noul') {
      const lower = text.toLowerCase()

      if (/\s(and|or)\s/.test(lower) && lower.length > 30) {
        lints.push({
          id: 'compound-noul',
          questionId: id,
          severity: 'warn',
          message: `${label} looks like it asks two things at once. The model has to judge both, and the probability means less. Ask two Nouls and combine them in code.`,
          learnHref: '/learn/noul',
        })
      }

      if (/\b(free of|without|not|never|no|none)\b|n[’']t\b/.test(lower)) {
        lints.push({
          id: 'negative-noul',
          questionId: id,
          severity: 'warn',
          message: `${label} is phrased negatively. Word it so a high value means yes, or code reading it later will get it backwards.`,
          learnHref: '/learn/noul',
        })
      }

      if (/\bhow (much|many|strong|severe|good)\b/.test(lower)) {
        lints.push({
          id: 'degree-noul',
          questionId: id,
          severity: 'warn',
          message: `${label} asks about degree. A Noul of 0.5 means the model gives yes and no equal probability, not "medium" — use a Score for a spectrum.`,
          learnHref: '/learn/noul',
        })
      }
    }

    // Jaggedness: things code should compute instead.
    const lower = text.toLowerCase()
    if (/\bhow many\b|\bcount\b|\bnumber of\b/.test(lower)) {
      lints.push({
        id: 'counting',
        questionId: id,
        severity: 'warn',
        message: `${label} asks the model to count. Jev recognises the shape of an answer rather than tallying — ask one question per item and add them up in code.`,
        learnHref: '/limits#math',
      })
    }
    if (/\b(earlier|later|before|after)\b.*\bdate\b|\bdays between\b|\bhow long (ago|until)\b/.test(lower)) {
      lints.push({
        id: 'date-math',
        questionId: id,
        severity: 'warn',
        message: `${label} compares dates. Jev reads dates as text, not as ordered quantities — extract the parts and compare them in code.`,
        learnHref: '/limits#dates',
      })
    }
  }

  if (totalTokens > TOKEN_BUDGET_TOTAL) {
    lints.push({
      id: 'total-budget',
      severity: 'block',
      message: `This request is about ${totalTokens.toLocaleString()} tokens; Jev's budget is ${TOKEN_BUDGET_TOTAL.toLocaleString()}.`,
    })
  }

  return lints
}

export function hasBlockingLint(lints: Lint[]): boolean {
  return lints.some((l) => l.severity === 'block')
}
