import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/ui/code-block'
import { LessonList } from '@/components/lesson/lesson-list'
import { LESSONS } from '@/content/lessons'

export const metadata: Metadata = {
  title: 'Learn Jev',
  description:
    'Six short lessons: the contract, the three question types, confidence as policy, and exact checks in code. Each one runs a real request and ends in a checkpoint.',
}

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
  const minutes = LESSONS.reduce((m, l) => m + l.minutes, 0)

  return (
    <PageShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Six lessons · about {minutes} minutes · every one runs a real request
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Learn Jev</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        Jev is a System One model: fast, narrow judgments instead of reasoning out loud. It was
        trained with RLCD — reinforcement learning for calibrated decisions — so what comes back is a
        distribution you can threshold, not an argument you have to parse.
      </p>
      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        Each lesson opens a real request beside a few steps and a checkpoint that reads the live
        answer. No account needed; Lyzr pays for the runs up to a daily cap. Progress is kept in this
        browser only.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/learn/${LESSONS[0].slug}`}>Start with lesson 1</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/cheatsheet">The one-page cheatsheet</Link>
        </Button>
      </div>

      <LessonList />

      <section className="mt-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          The whole thing, in one request
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          Three questions of three types, judged in parallel, answered in one call. The lessons are
          footnotes to this.
        </p>
        <CodeBlock className="mt-3" code={FIRST_REQUEST} language="http" />
      </section>
    </PageShell>
  )
}
