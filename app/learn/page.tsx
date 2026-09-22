import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'
import { LessonList } from '@/components/lesson/lesson-list'
import { RequestFlow } from '@/components/visuals/visuals'
import { LESSONS } from '@/content/lessons'

export const metadata: Metadata = {
  title: 'Learn Jev',
  description:
    'Six short lessons: the contract, the three question types, confidence as policy, and exact checks in code. Each one runs a real request and ends in a checkpoint.',
}

export default function LearnPage() {
  const minutes = LESSONS.reduce((m, l) => m + l.minutes, 0)

  return (
    <PageShell>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
        About {minutes} minutes · progress saved in this browser
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Learn Jev</h1>
      <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground">
        Six short lessons. Each runs a real request and ends with a checkpoint.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild className="h-[38px] rounded-[10px]">
          <Link href={`/learn/${LESSONS[0].slug}`}>Start lesson 1</Link>
        </Button>
        <Button variant="outline" asChild className="h-[38px] rounded-[10px] bg-card">
          <Link href="/cheatsheet">Cheatsheet</Link>
        </Button>
      </div>

      <section className="mt-10" aria-labelledby="flow-heading">
        <h2 id="flow-heading" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          What you&rsquo;ll learn, in one picture
        </h2>
        <RequestFlow className="mt-3" />
      </section>

      <LessonList />
    </PageShell>
  )
}
