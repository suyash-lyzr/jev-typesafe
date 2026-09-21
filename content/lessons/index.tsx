import * as React from 'react'
import type { LastRun, ResultTab } from '@/lib/store'
import type { Policy } from '@/lib/policy'
import type { Question } from '@/lib/schema'
import { sumNouls } from '@/lib/resolvers'

/**
 * Six lessons, each a short run of steps against a real request.
 *
 * A step either detects that it is done (the reader ran something, or the
 * request now has a shape) or is marked done by hand. The checkpoint is a
 * predicate over a *live* answer — never a replay — and never over latency,
 * which varies with the network. Each checkpoint also names what the docs
 * recorded, so when a newer model lands somewhere else the lesson can say so
 * instead of leaving the reader stuck.
 */

export interface LessonContext {
  lastRun: LastRun | null
  /** A live answer, or null for none/replay. Checkpoints only ever read this. */
  live: LastRun | null
  questions: Record<string, Question>
  variants: Record<string, Question>
  policy: Policy
  presetId: string | null
  variantId: string | null
  tab: ResultTab
  dirty: boolean
  /** The policy as the lesson loaded it, to tell a moved slider from a new run. */
  startPolicy: string
  /** Steps already marked done, for a step that only counts after another. */
  stepsDone: Record<number, boolean>
}

export interface LessonActions {
  loadPreset: (slug: string, variant?: string) => void
  addQuestion: (id: string, question: Question) => void
  addVariant: (id: string, variant: Question) => void
  addEscapeOption: (id: string) => void
  setTab: (tab: ResultTab) => void
  applyPreset: (key: 'readonly' | 'money' | 'strict' | 'permissive') => void
}

export interface LessonStep {
  title: string
  body: React.ReactNode
  action?: { label: string; run: (a: LessonActions) => void }
  /** Detects completion. Steps without one are ticked by hand. */
  done?: (ctx: LessonContext) => boolean
}

export interface Lesson {
  slug: string
  n: number
  title: string
  minutes: number
  idea: string
  intro: React.ReactNode
  start: { preset: string; variant?: string }
  steps: LessonStep[]
  checkpoint: {
    text: string
    pass: (ctx: LessonContext) => boolean
    /** What the docs recorded on the pinned model, so drift can be named. */
    expected: string
    model: string
  }
  recorded?: {
    source: string
    columns: [string, string]
    rows: Array<{ label: string; value: string; variant?: string }>
  }
  notice: string[]
}

const liveAnswer = (ctx: LessonContext, id: string) => ctx.live?.answers[id]

export const LESSONS: Lesson[] = [
  {
    slug: 'contract',
    n: 1,
    title: 'The contract',
    minutes: 3,
    idea: 'You send a state and a map of named questions. You get back one typed answer per question. That is the whole API.',
    intro: (
      <>
        <p>
          The state is whatever your code already has — a ticket, a document, a JSON record. The
          questions are yours to name, and those names never reach the model, so each question has to
          say everything in its own instructions.
        </p>
        <p>
          Jev never writes prose and never explains itself. It returns probabilities, and your code
          does the branching — which means the decision is always yours and always auditable.
        </p>
      </>
    ),
    start: { preset: 'first-run', variant: 'stripe' },
    steps: [
      {
        title: 'Run the quickstart request',
        body: 'The panel on the right opens on the answer the docs recorded, marked as a replay. Press Run to ask the model now.',
        done: (ctx) => Boolean(ctx.live),
      },
      {
        title: 'Read the three shapes',
        body: 'A Choice names an option and gives every option a probability. A Score lands on a position between your levels. A Noul is one number — the probability of yes — with no confidence beside it.',
      },
      {
        title: 'Add a fourth question',
        body: 'Questions are evaluated independently and in parallel, so adding one costs its own tokens and barely moves the time.',
        action: {
          label: 'Add a Noul',
          run: (a) =>
            a.addQuestion('mentions_integration', {
              type: 'noul',
              instructions: 'Does the customer name a specific product or integration?',
            }),
        },
        done: (ctx) => Object.keys(ctx.questions).length >= 4,
      },
      {
        title: 'Run all four in one request',
        body: 'Watch the token count and the time: four answers, one call.',
        done: (ctx) => Object.keys(ctx.live?.answers ?? {}).length >= 4,
      },
    ],
    checkpoint: {
      text: 'One live run answers four questions of at least two types.',
      pass: (ctx) => {
        const answers = Object.values(ctx.live?.answers ?? {})
        return answers.length >= 4 && new Set(answers.map((x) => x.type)).size >= 2
      },
      expected: 'Any live run with four answers passes; this checkpoint does not depend on the model’s numbers.',
      model: 'jev-1.13.0',
    },
    recorded: {
      source: 'docs.typesafe.ai/introduction/quickstart',
      columns: ['answer', 'recorded in the docs'],
      rows: [
        { label: 'department', value: 'technical 0.85 · billing 0.15 · sales 0.00 · conf 0.78' },
        { label: 'frustration', value: '1.00 on 0–2, conf 1.00' },
        { label: 'is_urgent', value: '1.00' },
        { label: 'usage', value: '392 in / 65 out' },
      ],
    },
    notice: [
      'The ids you choose are for your code; the model sees only instructions and criteria.',
      'A live run lands near the docs, not on them: aliases move, and one answer promises nothing about the next.',
      'Nothing in the response is prose. Everything is a value your code can compare.',
    ],
  },
  {
    slug: 'choice',
    n: 2,
    title: 'Choice — one of a known set',
    minutes: 5,
    idea: 'A Choice settles which option fits. The probabilities sum to 1, so it must pick something.',
    intro: (
      <>
        <p>
          That last part is the trap. Give it three departments and a message belonging to none of
          them, and it still returns one of the three. Always add an escape option —{' '}
          <span className="font-mono text-xs">other</span> or <span className="font-mono text-xs">none</span>{' '}
          — and read <span className="font-mono text-xs">confidence</span> before acting on the winner.
        </p>
        <p>
          The distribution is the answer; the label only summarises it. A ticket that belongs to two
          teams comes back split, and the split is the useful part.
        </p>
      </>
    ),
    start: { preset: 'support-triage', variant: 'ambiguous' },
    steps: [
      {
        title: 'Run the ambiguous ticket',
        body: 'Wrong size and a double charge in one message: two teams have a real claim to it.',
        done: (ctx) => Boolean(ctx.live) && ctx.variantId === 'ambiguous',
      },
      {
        title: 'Read the department split',
        body: 'Look at the second option, not just the first. The Policy tab can copy a runner-up with a real share of the probability.',
      },
      {
        title: 'Give department an escape option',
        body: 'The linter already flags it. Without one, a ticket about something else entirely would still be forced into returns, shipping or billing.',
        action: { label: 'Add "other"', run: (a) => a.addEscapeOption('department') },
        done: (ctx) => {
          const q = ctx.questions.department
          return q?.type === 'choice' && Object.keys(q.criteria).some((k) => /^other/.test(k))
        },
      },
      {
        title: 'Run it again',
        body: 'Every option, including the new one, comes back with a probability.',
        done: (ctx) => {
          const a = liveAnswer(ctx, 'department')
          return a?.type === 'choice' && Object.keys(a.probabilities).some((k) => /^other/.test(k))
        },
      },
    ],
    checkpoint: {
      text: 'A live department answer carries a probability for the escape option too.',
      pass: (ctx) => {
        const a = liveAnswer(ctx, 'department')
        return a?.type === 'choice' && Object.keys(a.probabilities).some((k) => /^other/.test(k))
      },
      expected: 'Checks the shape of the answer, not its numbers, so any model passes once the option exists.',
      model: 'jev-1.13.0',
    },
    recorded: {
      source: 'docs.typesafe.ai/primitives/choice',
      columns: ['question', "the docs' own ambiguous ticket"],
      rows: [
        { label: 'department', value: 'returns 0.61 · billing 0.35 · shipping 0.04 · conf 0.42' },
        { label: 'requested_resolution', value: 'refund 0.40 · replacement 0.34 · exchange 0.24 · conf 0.20' },
        { label: 'tone', value: 'frustrated 0.84 · angry 0.16 · conf 0.76' },
      ],
    },
    notice: [
      'The docs publish these numbers for their own ambiguous ticket, whose text is not on the page; ours is similar, not identical.',
      'Low confidence usually means none of the options is a clear winner — a reason to ask, not to guess.',
      'Option keys and descriptions both reach the model. Describe what separates the options.',
    ],
  },
  {
    slug: 'score',
    n: 3,
    title: 'Score — a position on a described spectrum',
    minutes: 6,
    idea: 'You give 2 to 10 ordered levels. You get a probability-weighted mean of the level numbers.',
    intro: (
      <>
        <p>
          Each level is judged against the state on its own. It never sees its own number or its
          neighbours. So levels have to describe recognisable situations — &ldquo;Broken or degraded
          feature, but workaround exists&rdquo; — never degrees like &ldquo;moderately severe&rdquo;,
          and never bare numbers.
        </p>
        <p>
          The returned score is arithmetic over that distribution, so a 1.0 on a three-level Score can
          mean a confident middle or an even split between the ends. Read the probabilities, not just
          the mean.
        </p>
      </>
    ),
    start: { preset: 'bug-severity', variant: 'misaligned-button' },
    steps: [
      {
        title: 'Run the misaligned button',
        body: 'A cosmetic bug, scored against the docs’ three descriptive levels.',
        done: (ctx) => Boolean(ctx.live),
      },
      {
        title: 'Add a variant B with numbers for levels',
        body: 'The same question, but the levels are "0", "1" and "2" and the instruction says 2 is worst. Both variants travel in the same request.',
        action: {
          label: 'Add numeric variant B',
          run: (a) =>
            a.addVariant('bug_severity', {
              type: 'score',
              instructions: 'Rate severity from 0 to 2, where 2 is worst',
              criteria: ['0', '1', '2'],
            }),
        },
        done: (ctx) => {
          const b = ctx.variants.bug_severity
          return b?.type === 'score' && b.criteria.every((c) => typeof c === 'string' && /^\d$/.test(c))
        },
      },
      {
        title: 'Run A and B in one request',
        body: 'Compare the two distributions side by side on the same card.',
        done: (ctx) => Boolean(liveAnswer(ctx, 'bug_severity__A') && liveAnswer(ctx, 'bug_severity__B')),
      },
    ],
    checkpoint: {
      text: 'In one live run, the numeric variant B is clearly less confident than the descriptive variant A.',
      pass: (ctx) => {
        const a = liveAnswer(ctx, 'bug_severity__A')
        const b = liveAnswer(ctx, 'bug_severity__B')
        return a?.type === 'score' && b?.type === 'score' && b.confidence < a.confidence - 0.2
      },
      expected: 'The docs record descriptive levels at 0.0 with confidence 1.00 and numeric levels at 0.55 with confidence 0.33 on this report.',
      model: 'jev-1.13.0',
    },
    recorded: {
      source: 'docs.typesafe.ai/primitives/score',
      columns: ['report', 'score · confidence'],
      rows: [
        { label: 'Misaligned button', value: '0.00 · 1.00', variant: 'misaligned-button' },
        { label: 'PDF export does nothing', value: '1.00 · 1.00', variant: 'pdf-export-dead' },
        { label: 'Spinner never finishes', value: '1.11 · 0.84', variant: 'spinner' },
        { label: 'Safari crash', value: '1.43 · 0.35', variant: 'safari-crash' },
        { label: 'Nobody can log in', value: '2.00 · 1.00', variant: 'nobody-can-log-in' },
        { label: 'Misaligned, numeric levels', value: '0.55 · 0.33' },
      ],
    },
    notice: [
      '"2 is worst" means nothing to the model: each level is judged alone.',
      'A fractional score is a position, not a percentage. 1.43 means split between levels 1 and 2.',
      'Higher confidence alone does not prove a wording is better — test it against inputs whose answer you know.',
    ],
  },
  {
    slug: 'noul',
    n: 4,
    title: 'Noul — the probability of a yes',
    minutes: 4,
    idea: 'One condition, one number between 0 and 1. No confidence field: two outcomes are fully described by one value.',
    intro: (
      <>
        <p>
          The docs put it plainly: a Noul&rsquo;s distribution has only two outcomes, so the single
          value describes it completely. That also means{' '}
          <strong className="text-foreground">0.5 is not &ldquo;medium&rdquo;</strong> — it is
          &ldquo;equally likely either way&rdquo;, the model telling you it cannot separate them.
        </p>
        <p>
          Phrase every Noul so a high number means yes, keep it to one condition, and threshold it in
          two places: a yes bar, a no bar, and the gap between them goes to a person.
        </p>
      </>
    ),
    start: { preset: 'resume-screening', variant: 'occasional-scripts' },
    steps: [
      {
        title: 'Run the occasional-scripts candidate',
        body: '"Is the candidate strong in Python?" beside a Score of how much Python experience they have.',
        done: (ctx) => Boolean(ctx.live) && ctx.variantId === 'occasional-scripts',
      },
      {
        title: 'Compare the Noul with the Score',
        body: 'A low Noul does not mean a little skill. It means "strong" is probably false — while the Score places the same resume on "Some familiarity".',
      },
      {
        title: 'Try the two-years-daily candidate',
        body: 'The Noul jumps; the Score moves about one level. The spacing between Noul values is not something you chose.',
        action: { label: 'Load that candidate', run: (a) => a.loadPreset('resume-screening', 'two-years-daily') },
        done: (ctx) => Boolean(ctx.live) && ctx.variantId === 'two-years-daily',
      },
    ],
    checkpoint: {
      text: 'For the occasional-scripts candidate, the live Noul says "probably not strong" (below 0.5) while the Score places them at level 1 or above.',
      pass: (ctx) => {
        if (ctx.variantId !== 'occasional-scripts') return false
        const n = liveAnswer(ctx, 'python_strong')
        const s = liveAnswer(ctx, 'python_experience')
        return n?.type === 'noul' && s?.type === 'score' && n.noul < 0.5 && s.score >= 0.5
      },
      expected: 'The docs record 0.14 on the Noul and 1.0 on the Score for this candidate.',
      model: 'jev-1.13.0',
    },
    recorded: {
      source: 'docs.typesafe.ai/primitives/noul',
      columns: ['candidate', 'Noul "strong" · Score'],
      rows: [
        { label: 'Java and Go, no Python', value: '0.03 · 0.0', variant: 'java-and-go' },
        { label: 'Occasional scripts', value: '0.14 · 1.0', variant: 'occasional-scripts' },
        { label: 'Two years, daily', value: '0.81 · 2.05', variant: 'two-years-daily' },
        { label: 'Eight years, Django', value: '0.92 · 2.89', variant: 'eight-years-django' },
      ],
    },
    notice: [
      'A Noul answers one proposition. If the question is really about degree, use a Score.',
      'There is no confidence on a Noul; the value is the whole answer.',
      'Word it so high means yes: "Is the message free of personal data?" gets read backwards later.',
    ],
  },
  {
    slug: 'policy',
    n: 5,
    title: 'Confidence is your routing signal',
    minutes: 6,
    idea: 'The answer says what. Confidence says whether to act on it without a person.',
    intro: (
      <>
        <p>
          Confidence falls out of how spread the probabilities are — a flat distribution gives a low
          number. Three bands do most of the work: act automatically, confirm or review, or send it to
          a person. Set the bars by what the action costs.
        </p>
        <p>
          Calibration is a promise about many predictions — outcomes given 0.8 should happen about 80%
          of the time — not about the one answer in front of you. And re-deciding costs nothing: the
          thresholds run in your code, against the answer you already have.
        </p>
      </>
    ),
    start: { preset: 'voice-banking', variant: 'transfer' },
    steps: [
      {
        title: 'Run the transfer request',
        body: '"Move two thousand from savings to checking" — the branch where a wrong read moves money.',
        done: (ctx) => Boolean(ctx.live),
      },
      {
        title: 'Open the Policy tab',
        body: 'Every threshold there re-decides the cached answer. None of them calls the model.',
        action: { label: 'Open Policy', run: (a) => a.setTab('policy') },
        done: (ctx) => ctx.tab === 'policy',
      },
      {
        title: 'Try the read-only bar',
        body: 'The same answer against 0.6, the confidence-routing pattern’s bar for checking a balance. The decision can change; the answer does not.',
        action: { label: 'Read-only · 0.6', run: (a) => a.applyPreset('readonly') },
        done: (ctx) => ctx.policy.rules.some((r) => r.kind === 'band' && r.act === 0.6),
      },
      {
        title: 'Back to the money bar',
        body: 'This preset started here: act above 0.9, confirm between 0.5 and 0.9, send anything lower to a person (docs.typesafe.ai/confidence). Moving money earns the higher bar.',
        action: { label: 'Money moves · 0.9', run: (a) => a.applyPreset('money') },
        // The preset already starts at 0.9, so this only counts after the
        // reader has moved off it.
        done: (ctx) => Boolean(ctx.stepsDone[2]) && ctx.policy.rules.some((r) => r.kind === 'band' && r.act === 0.9),
      },
    ],
    checkpoint: {
      text: 'You changed the policy after a live run, and the run is still the current one — the decision moved with zero API calls.',
      pass: (ctx) => Boolean(ctx.live) && !ctx.dirty && JSON.stringify(ctx.policy) !== ctx.startPolicy,
      expected: 'Independent of the model: this checks that thresholds re-decide cached answers.',
      model: 'jev-1.13.0',
    },
    recorded: {
      source: 'docs.typesafe.ai/confidence · /patterns/confidence-routing',
      columns: ['action', 'bar in the docs'],
      rows: [
        { label: 'Anything, below the floor', value: 'to a person under 0.5 (0.6 in the pattern page)' },
        { label: 'Check a balance', value: 'act at 0.6' },
        { label: 'Approve a transfer', value: 'act above 0.9 (0.85 in the pattern page); otherwise confirm' },
      ],
    },
    notice: [
      'Different actions in the same system get different bars.',
      'Start conservative, test on your own data, and adjust.',
      'The docs pin thresholds in code as named constants; the Code tab does the same.',
    ],
  },
  {
    slug: 'exact-checks',
    n: 6,
    title: 'Keep exact checks in code',
    minutes: 7,
    idea: 'Jev reads; your code computes. Counting, dates and arithmetic belong in code.',
    intro: (
      <>
        <p>
          The jaggedness guide is blunt: jev-1.13 does not count reliably. It recognises the shape of
          an answer rather than tallying, and the error grows with the size of what is being counted.
        </p>
        <p>
          The rewrite asks one yes/no question per item — each a judgment the model is good at — and
          adds the answers up in code. All twenty still travel in one request.
        </p>
      </>
    ),
    start: { preset: 'limit-counting', variant: 'breaks' },
    steps: [
      {
        title: 'Ask for the count directly',
        body: 'Twenty words, ten of them fruit. The Choice offers 0 to 20. Watch the confidence, not just the pick.',
        done: (ctx) => Boolean(ctx.live) && ctx.variantId === 'breaks',
      },
      {
        title: 'Switch to one question per item',
        body: '"Is items[i] the name of a fruit?", twenty times over.',
        action: { label: 'Load the rewrite', run: (a) => a.loadPreset('limit-counting', 'works') },
        done: (ctx) => ctx.variantId === 'works',
      },
      {
        title: 'Run it, and let code add up',
        body: 'The checkpoint below counts the yes answers above 0.5 — in your browser, not in the model.',
        done: (ctx) => Boolean(ctx.live) && ctx.variantId === 'works',
      },
    ],
    checkpoint: {
      text: 'Code counts exactly 10 fruit from the twenty live yes/no answers.',
      pass: (ctx) => {
        if (ctx.variantId !== 'works' || !ctx.live) return false
        return sumNouls(ctx.live.answers, 'item_').count === 10
      },
      expected: 'The list has ten fruit — kiwi, mango, plum, grape, lemon, cherry, peach, fig, lime, pear — so the answer is 10 on any model that reads the words right.',
      model: 'jev-1.13.0',
    },
    notice: [
      'The model never did arithmetic in the rewrite; it made twenty small judgments.',
      'Dates work the same way: extract the parts with Choices, do the arithmetic in code. See the Limits page.',
      'If the count is wrong, one of the twenty readings was wrong — a much easier bug to find.',
    ],
  },
]

export function getLesson(slug: string): Lesson | null {
  return LESSONS.find((l) => l.slug === slug) ?? null
}
