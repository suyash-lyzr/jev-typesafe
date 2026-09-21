import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { CodeBlock } from '@/components/ui/code-block'
import { SITE } from '@/lib/site'
import { PRICING } from '@/lib/pricing'

export const metadata: Metadata = {
  title: 'Learn Jev in 5 minutes',
  description:
    'Six lessons: the contract, the three question types, confidence as policy, and fan-out. Each one opens a real request you can run.',
}

interface Lesson {
  n: number
  title: string
  idea: string
  detail: React.ReactNode
  run: { slug: string; variant: string; label: string }
}

const LESSONS: Lesson[] = [
  {
    n: 1,
    title: 'The contract',
    idea: 'You send a state and a map of named questions. You get back one typed answer per question. That is the whole API.',
    detail: (
      <>
        <p>
          The state is whatever your code already has — a ticket, a document, a JSON record. The
          questions are yours to name, and those names never reach the model, so the question has to
          say everything in its own <span className="font-mono text-xs">instructions</span>.
        </p>
        <p>
          Jev never writes prose and never explains itself. It returns probabilities. Your code does
          the branching, which means the decision is always auditable and always yours.
        </p>
      </>
    ),
    run: { slug: 'first-run', variant: 'stripe', label: 'Run one request with all three types' },
  },
  {
    n: 2,
    title: 'Choice — one of a known set',
    idea: 'A Choice settles which option fits. The probabilities sum to 1, so it must pick something.',
    detail: (
      <>
        <p>
          That last part is the trap. Give it three departments and a message belonging to none of
          them, and it still returns one of the three. Always add an escape option —{' '}
          <span className="font-mono text-xs">other</span> or{' '}
          <span className="font-mono text-xs">none</span> — and read{' '}
          <span className="font-mono text-xs">confidence</span> before you act on the winner.
        </p>
        <p>
          A description can be a structured object rather than a sentence. Options the model keeps
          confusing get sharper when you say both what each covers and what it is not for.
        </p>
      </>
    ),
    run: { slug: 'support-triage', variant: 'ambiguous', label: 'See a genuinely ambiguous ticket' },
  },
  {
    n: 3,
    title: 'Score — a position on a described spectrum',
    idea: 'You give 2 to 10 ordered levels. You get a probability-weighted mean of the level numbers.',
    detail: (
      <>
        <p>
          Each level is judged against the state on its own. It never sees its own number, and it
          never sees its neighbours. So levels have to describe recognisable situations —
          &ldquo;Broken feature, but a workaround exists&rdquo; — and never degrees like
          &ldquo;moderately severe&rdquo;, and never bare numbers.
        </p>
        <p>
          The returned <span className="font-mono text-xs">score</span> is arithmetic over that
          distribution, so a 1.0 on a three-level Score can mean confident middle, or an even split
          between the ends. Read <span className="font-mono text-xs">probabilities</span>, not just
          the mean.
        </p>
      </>
    ),
    run: { slug: 'bug-severity', variant: 'misaligned-button', label: 'Score the same bug five ways' },
  },
  {
    n: 4,
    title: 'Noul — the probability of a yes',
    idea: 'One condition, one number between 0 and 1. No confidence field, because there is nothing to be uncertain between.',
    detail: (
      <>
        <p>
          A Noul&rsquo;s two outcomes are yes and no, so the single value describes the distribution
          completely. That also means <strong className="text-foreground">0.5 is not medium</strong> —
          it is &ldquo;equally likely either way&rdquo;, which is the model telling you it cannot
          separate them.
        </p>
        <p>
          Phrase every Noul so a high number means yes, keep it to one condition, and threshold it in
          two places rather than one: a yes bar, a no bar, and the gap in between goes to a person.
        </p>
      </>
    ),
    run: {
      slug: 'resume-screening',
      variant: 'occasional-scripts',
      label: 'Watch a Noul sit in the middle',
    },
  },
  {
    n: 5,
    title: 'Confidence is your routing signal',
    idea: 'The answer says what. Confidence says whether to act on it without a human.',
    detail: (
      <>
        <p>
          Confidence falls out of how spread the probabilities are — a flat distribution is a low
          number. Three bands do most of the work: act automatically, confirm or review, or send it
          to a person.
        </p>
        <p>
          Set the bars by what the action costs. A read-only lookup is fine around 0.6; moving money
          wants 0.85 to 0.9. And note what calibration does and does not promise: 0.8 means right
          about 80% of the time <em>across many predictions</em>. It guarantees nothing about the one
          answer in front of you.
        </p>
        <p>
          Re-tuning thresholds needs no new API calls. The playground&rsquo;s policy tab re-routes
          the answer you already have, so exploring costs nothing.
        </p>
      </>
    ),
    run: { slug: 'voice-banking', variant: 'transfer', label: 'Same intent, two different bars' },
  },
  {
    n: 6,
    title: 'Ask everything at once',
    idea: 'Questions are scored in parallel and never see each other. Adding one barely moves latency and cannot degrade the others.',
    detail: (
      <>
        <p>
          So ask every question you might need — including the ones that will not apply — and throw
          away the answers you do not use. TypeSafe&rsquo;s own test put one fanned-out call at 12.2×
          cheaper and 10× faster than thirteen separate ones, with identical answers.
        </p>
        <p>
          The budget, not a question count, is the real limit: 64k tokens per request, and 32k for the
          state plus the longest single question.
        </p>
      </>
    ),
    run: { slug: 'smart-home', variant: 'compound', label: 'One call, every intent, filtered in code' },
  },
]

const FIRST_REQUEST = `POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY

{
  "state": "My card was charged twice for order 8812.",
  "model": "jev-latest",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this message?",
      "criteria": {
        "billing": "A charge, refund or invoice is disputed",
        "shipping": "An order is late, missing or untrackable",
        "other": "None of the above"
      }
    },
    "severity": {
      "type": "score",
      "instructions": "How much is this costing the customer right now?",
      "criteria": [
        "An inconvenience; nothing is lost",
        "Money is held but recoverable",
        "Money is gone and the customer is blocked"
      ]
    },
    "wants_human": {
      "type": "noul",
      "instructions": "Is the customer asking to speak to a person?"
    }
  }
}`

export default function LearnPage() {
  return (
    <PageShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Six lessons · about five minutes · every one opens a real request
      </p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Learn Jev in 5 minutes</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        Jev is a System One model: fast, narrow judgments instead of reasoning out loud. It was
        trained with RLCD — reinforcement learning for calibrated decisions — so what you get back is
        a distribution you can threshold, not an argument you have to parse.
      </p>

      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        Nothing here needs an account. Lyzr pays for these runs up to a daily cap; past that,
        presets replay answers we recorded, always labelled as replays.
      </p>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          The whole thing, in one request
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          Three questions of three different types, judged in parallel, answered in about a tenth of
          a second for a fraction of a cent. Everything below is a footnote to this.
        </p>
        <CodeBlock className="mt-3" code={FIRST_REQUEST} language="http" />
      </section>

      {LESSONS.map((lesson) => (
        <section key={lesson.n} className="mt-12 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xl font-semibold">
              <span className="mr-2 font-mono text-sm text-muted-foreground">
                {String(lesson.n).padStart(2, '0')}
              </span>
              {lesson.title}
            </h2>
          </div>

          <p className="mt-2.5 max-w-[62ch] text-[15px] font-medium leading-relaxed">
            {lesson.idea}
          </p>

          <div className="mt-3 max-w-[62ch] space-y-3 text-sm leading-relaxed text-muted-foreground">
            {lesson.detail}
          </div>

          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href={`/play?p=${lesson.run.slug}&v=${lesson.run.variant}`}>
              {lesson.run.label} →
            </Link>
          </Button>
        </section>
      ))}

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="text-xl font-semibold">Four patterns worth knowing by name</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            [
              'Speculative fan-out',
              'Ask every question you might need in one request; ignore what does not apply.',
            ],
            [
              'Confidence-gated routing',
              'The answer decides what happens. Confidence decides who decides.',
            ],
            [
              'Composite scoring',
              'Several Scores, each normalised by levels − 1, then weighted in your code.',
            ],
            [
              'Intent routing',
              'Jev classifies, then deterministic code, a specialist LLM, or a human takes it.',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-[13px] font-medium">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="text-xl font-semibold">What it costs and where it stops</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip variant="outline">${PRICING.jev.inPerM} / 1M input · output free</Chip>
          <Chip variant="outline">64k per request · 32k state + longest question</Chip>
          <Chip variant="outline">250k tokens/sec · 1,200 req/min</Chip>
          <Chip variant="outline">Text only</Chip>
          <Chip variant="outline">No fine-tuning — shared weights</Chip>
        </div>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          There is no fine-tuning and no LoRA; everyone runs the same weights, so all of your
          adaptation lives in how you write questions and where you set thresholds. Pin the versioned
          model id once you have tuned any of it —{' '}
          <span className="font-mono text-xs">jev-latest</span> moves.
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Next: read the failures</h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          You now know enough to use it. The other half of knowing a model is knowing where it gives
          out — counting, dates, double negatives, injected instructions, and probabilities that
          refuse to sum to 1. Five of those run live, each beside the rewrite that works.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/limits">Where Jev breaks →</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/presets">Browse all presets</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cheatsheet">One-page cheatsheet</Link>
          </Button>
        </div>
      </section>

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">
        Figures quoted here are TypeSafe&rsquo;s own, from{' '}
        <a className="text-brand hover:underline" href={SITE.links.docs}>
          docs.typesafe.ai
        </a>
        . {SITE.provenance} {SITE.disclaimer}
      </p>
    </PageShell>
  )
}
