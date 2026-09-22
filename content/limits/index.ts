import type { Answer } from '@/lib/schema'
import { assembleDate, datePartsFrom, daysBetween, sumNouls } from '@/lib/resolvers'
import { FRUIT_ITEMS } from '@/content/presets/limits'

/**
 * What each Limits demo checks, judged on a live answer.
 *
 * An assertion reads the answers and says, in words, whether the failure mode
 * showed up this time. "Still fails" is not a verdict on the model, and "held
 * this time" is not a fix: the jaggedness guide describes tendencies, and a
 * single run can land either way. The "works" side is the rewrite, and its
 * check is that the code — not the model — produced the right result.
 */

export interface Verdict {
  /** For a "breaks" side: did the failure appear? For a "works" side: did the rewrite hold? */
  /** 'no-answer': a question came back without an answer, so nothing was tested. */
  outcome: 'failed' | 'held' | 'works' | 'did-not-work' | 'no-answer'
  detail: string
}

export interface LimitSpec {
  preset: string
  anchor: string
  /** Its number in TypeSafe's jaggedness table, or null when it comes from elsewhere. */
  mode: number | null
  heading: string
  /** What the docs say, paraphrased closely and attributed. */
  docs: string
  source: string
  advice: string
  check: Record<string, (answers: Record<string, Answer>) => Verdict>
}

const noul = (a?: Answer) => (a?.type === 'noul' ? a.noul : NaN)

export const LIMITS: LimitSpec[] = [
  {
    preset: 'limit-counting',
    anchor: 'math',
    mode: 2,
    heading: 'Counting',
    docs: 'jev-1.13 does not count reliably — characters, occurrences, items in a list. It recognises the shape of an answer rather than tallying, and the error grows with the size of the thing counted.',
    source: 'docs.typesafe.ai/model-jaggedness/jev-1.13#counting',
    advice: 'Ask one yes/no question per item and add the answers up in your code.',
    check: {
      breaks: (a) => {
        const c = a.fruit_count
        if (c?.type !== 'choice') return { outcome: 'no-answer', detail: 'No count came back.' }
        const spread = Object.entries(c.probabilities)
          .filter(([, p]) => p >= 0.1)
          .map(([k]) => k)
          .sort((x, y) => Number(x) - Number(y))
        const range = spread.length > 1 ? `${spread[0]}–${spread[spread.length - 1]}` : spread[0] ?? c.choice
        if (c.choice !== '10') {
          return { outcome: 'failed', detail: `It picked ${c.choice} at confidence ${c.confidence.toFixed(2)}. The list has ten fruit.` }
        }
        return c.confidence < 0.5
          ? { outcome: 'failed', detail: `It picked 10, the right count — at confidence ${c.confidence.toFixed(2)}, with the probability spread over ${range}. That is a guess at the size of the answer, not a tally.` }
          : { outcome: 'held', detail: `It picked 10 at confidence ${c.confidence.toFixed(2)} this time. The guide says it cannot be relied on to.` }
      },
      works: (a) => {
        const { count, yes: ids } = sumNouls(a, 'item_')
        const yes = ids.map((id) => FRUIT_ITEMS[Number(id.slice('item_'.length))] ?? id)
        return count === 10
          ? { outcome: 'works', detail: `Code counted ${count}: ${yes.join(', ')} — twenty yes/no answers, added up outside the model.` }
          : { outcome: 'did-not-work', detail: `Code counted ${count} (${yes.join(', ') || 'none'}). One of the per-item answers was wrong; that is a reading error, not a counting one.` }
      },
    },
  },
  {
    preset: 'limit-dates',
    anchor: 'dates',
    mode: 3,
    heading: 'Date and time comparison',
    docs: 'jev-1.13 reads dates as text, not as ordered quantities. Which came first, how far apart, inside a window — all unreliable, and worse with mixed formats.',
    source: 'docs.typesafe.ai/model-jaggedness/jev-1.13#date-and-time-comparison',
    advice: 'Extract the parts with Choice questions — each part is a small closed set with a "none" option — then compare and subtract in code.',
    check: {
      breaks: (a) => {
        const v = noul(a.gap_over_10)
        // 2026-02-20 to 2026-03-02 is exactly 10 days, so "more than 10?" is no.
        return v >= 0.5
          ? { outcome: 'failed', detail: `${v.toFixed(2)} — a confident yes. The gap is exactly 10 days (February 2026 has 28), so "more than 10" is a no.` }
          : { outcome: 'held', detail: `${v.toFixed(2)} — it said no, which is right: the gap is exactly 10 days. It got this one wrong in our runs; nothing guarantees either way.` }
      },
      works: (a) => {
        const start = assembleDate(datePartsFrom(a, 'start'))
        const end = assembleDate(datePartsFrom(a, 'end'))
        const gap = daysBetween(start, end)
        if (!gap.ok) return { outcome: 'did-not-work', detail: `Code could not do the arithmetic: ${gap.reason}.` }
        const read = start.ok && end.ok ? `${start.iso} → ${end.iso}` : ''
        return gap.days === 10
          ? { outcome: 'works', detail: `The parts were read as ${read}, and code counted ${gap.days} days — so "more than 10" is no.` }
          : { outcome: 'did-not-work', detail: `Code counted ${gap.days} days from ${read}; a part was misread.` }
      },
    },
  },
  {
    preset: 'limit-invariants',
    anchor: 'invariants',
    mode: 8,
    heading: 'Structural invariants',
    docs: 'Many identities you might expect are not guaranteed. The same question as a Noul and as a yes/no Choice gave 0.22 and 0.01; a question and its negation gave 0.72 and 0.47, summing to 1.19.',
    source: 'docs.typesafe.ai/model-jaggedness/jev-1.13#common-sense-structural-invariants',
    advice: 'Ask each decision one way, derive the complement in code, and never carry a threshold tuned on a Noul over to a Choice.',
    check: {
      breaks: (a) => {
        const n = noul(a.asks_refund_noul)
        const c = a.asks_refund_choice?.type === 'choice' ? a.asks_refund_choice.probabilities.yes ?? NaN : NaN
        const gap = Math.abs(n - c)
        return gap > 0.1
          ? { outcome: 'failed', detail: `Noul ${n.toFixed(2)} vs Choice yes ${c.toFixed(2)} — a gap of ${gap.toFixed(2)} for the same question.` }
          : { outcome: 'held', detail: `Noul ${n.toFixed(2)} vs Choice yes ${c.toFixed(2)} — close this time. Nothing guarantees it.` }
      },
      'breaks-negation': (a) => {
        const sum = noul(a.refund) + noul(a.not_refund)
        return Math.abs(sum - 1) > 0.05
          ? { outcome: 'failed', detail: `${noul(a.refund).toFixed(2)} + ${noul(a.not_refund).toFixed(2)} = ${sum.toFixed(2)}, not 1.` }
          : { outcome: 'held', detail: `The two sum to ${sum.toFixed(2)} this time. Nothing guarantees it.` }
      },
    },
  },
  {
    preset: 'limit-injected-state',
    anchor: 'injected',
    mode: 6,
    heading: 'Adversarial content',
    docs: 'State is data, and jev-1.13 does not treat it as hostile by default. An injected instruction, a misleading framing, or text that argues for its own classification can move the answer.',
    source: 'docs.typesafe.ai/model-jaggedness/jev-1.13#adversarial-content',
    advice: 'Be explicit in the criteria and test edge cases before deploying (the docs). Our addition: a separate question about whether the text addresses the classifier.',
    check: {
      breaks: (a) => {
        const d = a.department
        if (d?.type !== 'choice') return { outcome: 'no-answer', detail: 'No department came back.' }
        const billing = d.probabilities.billing ?? 0
        // Without the planted line this ticket is shipping at 1.0, billing 0.
        return d.choice === 'billing' || billing >= 0.2
          ? { outcome: 'failed', detail: `The planted line moved ${billing.toFixed(2)} of the probability to billing (${d.choice} at confidence ${d.confidence.toFixed(2)}). The same ticket without it is shipping at 1.0.` }
          : { outcome: 'held', detail: `Billing got only ${billing.toFixed(2)} this time; it chose ${d.choice}.` }
      },
      works: (a) => {
        const flagged = noul(a.instructs_classifier)
        const got = a.department?.type === 'choice' ? a.department.choice : '?'
        return flagged > 0.7
          ? { outcome: 'works', detail: `The detection question flagged the planted note at ${flagged.toFixed(2)}, so code can hold the ticket whatever the department answer (${got}).` }
          : { outcome: 'did-not-work', detail: `The detection question read ${Number.isFinite(flagged) ? flagged.toFixed(2) : '?'} — it did not flag the note. A filter, not a security boundary.` }
      },
    },
  },
  {
    preset: 'limit-numeric-levels',
    anchor: 'numeric-levels',
    mode: null,
    heading: 'Levels that are only numbers',
    docs: 'Not one of the nine modes — a Score mistake the Score page demonstrates. Each level is judged on its own, so "0", "1", "2" give the model nothing to match: the docs record 0.55 at confidence 0.33 where descriptive levels give 0.0 at 1.0.',
    source: 'docs.typesafe.ai/primitives/score#writing-good-levels',
    advice: 'Describe the situation at each level, not a degree.',
    check: {
      breaks: (a) => {
        const s = a.bug_severity
        return s?.type === 'score' && s.confidence < 0.6
          ? { outcome: 'failed', detail: `Score ${s.score.toFixed(2)} at confidence ${s.confidence.toFixed(2)} — split between levels with nothing to match against.` }
          : { outcome: 'held', detail: s?.type === 'score' ? `Confidence ${s.confidence.toFixed(2)} this time.` : 'No score came back.' }
      },
      works: (a) => {
        const s = a.bug_severity
        return s?.type === 'score' && s.confidence >= 0.9 && s.score < 0.5
          ? { outcome: 'works', detail: `Score ${s.score.toFixed(2)} at confidence ${s.confidence.toFixed(2)}: squarely "Cosmetic", once the level says what cosmetic means.` }
          : { outcome: 'did-not-work', detail: s?.type === 'score' ? `Score ${s.score.toFixed(2)} at confidence ${s.confidence.toFixed(2)}.` : 'No score came back.' }
      },
    },
  },
]

/** The modes shown for reference only, quoted from the same page. */
export const QUOTED_MODES: Array<{ mode: number; anchor: string; heading: string; docs: string; instead: string }> = [
  { mode: 1, anchor: 'literal', heading: 'Literal reading', docs: 'It answers the question you wrote, not the one you meant: scoping words, negations and implied conditions are read at face value.', instead: 'Write the exact condition, and put boundary cases in the criteria.' },
  { mode: 4, anchor: 'indirection', heading: 'Indirection', docs: 'Double negatives, a property of a property, or several hops of reasoning cost accuracy.', instead: 'Write instructions as directly as possible and name the relevant part of the state.' },
  { mode: 5, anchor: 'big-state', heading: 'Large state full of irrelevant detail', docs: 'Accuracy falls as the state grows with content unrelated to the decision; unrelated detail acts as a distractor.', instead: 'Filter in code and send only what the question needs. The support-triage preset has a “distracting” variant to try.' },
  { mode: 7, anchor: 'contradictions', heading: 'Contradictory instructions and criteria', docs: 'When instructions and criteria ask for different things — a Noul whose true maps to no — performance drops.', instead: 'Treat the criteria as an extension of the instruction, in plain words.' },
  { mode: 9, anchor: 'generation', heading: 'Generation', docs: 'It is not trained to generate text. Forcing it by chaining choices works badly and slowly.', instead: 'Find candidates with a regex or a generative model and let Jev pick among them.' },
]
