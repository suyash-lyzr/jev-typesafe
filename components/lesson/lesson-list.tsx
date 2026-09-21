'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LESSONS } from '@/content/lessons'
import { loadProgress, resetProgress, type LessonProgress } from '@/lib/storage'

/** Progress lives in this browser only, so it renders after mount. */
export function LessonList() {
  const [progress, setProgress] = React.useState<Record<string, LessonProgress> | null>(null)
  React.useEffect(() => setProgress(loadProgress()), [])

  const done = progress ? LESSONS.filter((l) => progress[l.slug]?.done).length : 0
  const firstOpen = progress ? LESSONS.find((l) => !progress[l.slug]?.done)?.slug : undefined

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Six lessons</h2>
        {progress && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span aria-live="polite">
              {done} of {LESSONS.length} done
            </span>
            {done > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetProgress()
                  setProgress({})
                }}
              >
                Reset progress
              </Button>
            )}
          </div>
        )}
      </div>

      <ol className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
        {LESSONS.map((lesson) => {
          const isDone = Boolean(progress?.[lesson.slug]?.done)
          return (
            <li key={lesson.slug}>
              <Link
                href={`/learn/${lesson.slug}`}
                className={cn(
                  'flex items-start gap-4 px-4 py-3.5 transition-colors duration-fast hover:bg-accent',
                  firstOpen === lesson.slug && 'border-l-2 border-foreground'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs',
                    isDone ? 'border-foreground bg-foreground text-background' : 'border-border'
                  )}
                  aria-hidden
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : lesson.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {lesson.title}
                    {isDone && <span className="sr-only"> (done)</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{lesson.idea}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{lesson.minutes} min</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
