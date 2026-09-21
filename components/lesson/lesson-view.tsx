'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { StateEditor, QuestionsList, LintBar, RunBar } from '@/components/playground/editor-pane'
import { ResultTabs, AnswersTab, ErrorCard } from '@/components/playground/result-pane'
import { PolicyTab, JsonTab, CodeTab } from '@/components/playground/policy-tab'
import { CompareTab } from '@/components/playground/compare-tab'
import { usePlayground } from '@/lib/store'
import { getPreset, presetToLoad } from '@/content/presets'
import { LESSONS, type Lesson, type LessonActions, type LessonContext } from '@/content/lessons'
import { loadProgress, saveProgress, type LessonProgress } from '@/lib/storage'
import { sumNouls } from '@/lib/resolvers'
import { SITE } from '@/lib/site'
import { useRunShortcut } from '@/components/playground/use-mod-key'

/**
 * One lesson: prose and steps on the left, the real playground on the right.
 *
 * It uses the same store and the same components as /play, so what a lesson
 * teaches is exactly what the playground does. Loading a lesson replaces the
 * editor with the lesson's request; nothing runs until the reader presses Run.
 */

function useLessonContext(startPolicy: string, stepsDone: Record<number, boolean>): LessonContext {
  const s = usePlayground()
  const live = s.lastRun && !s.lastRun.replay ? s.lastRun : null
  return {
    lastRun: s.lastRun,
    live,
    questions: s.questions,
    variants: s.variants,
    policy: s.policy,
    presetId: s.presetId,
    variantId: s.variantId,
    tab: s.tab,
    dirty: s.isDirtySinceRun(),
    startPolicy,
    stepsDone,
  }
}

function useActions(): LessonActions {
  return React.useMemo(() => {
    const store = usePlayground.getState
    return {
      loadPreset: (slug, variant) => {
        const preset = getPreset(slug)
        if (preset) store().load(presetToLoad(preset, variant))
      },
      addQuestion: (id, question) => {
        const s = store()
        if (Object.hasOwn(s.questions, id)) return
        s.replaceQuestions({ ...s.questions, [id]: question })
        s.setPolicy({
          rules: [
            ...store().policy.rules,
            question.type === 'noul'
              ? { q: id, kind: 'noul', yes: 0.8, no: 0.2 }
              : { q: id, kind: 'band', act: 0.85, review: 0.5 },
          ],
        })
        s.selectQuestion(id)
      },
      addVariant: (id, variant) => {
        const s = store()
        s.addVariant(id)
        s.updateVariant(id, variant)
        s.selectQuestion(id)
      },
      addEscapeOption: (id) => store().applyFix({ type: 'add-escape-option', questionId: id }),
      setTab: (tab) => store().setTab(tab),
      applyPreset: (key) => store().applyPreset(key),
    }
  }, [])
}

function Steps({ lesson, ctx, progress, onTick }: {
  lesson: Lesson
  ctx: LessonContext
  progress: LessonProgress
  onTick: (i: number) => void
}) {
  const actions = useActions()

  return (
    <ol className="space-y-4">
      {lesson.steps.map((step, i) => {
        const detected = step.done ? step.done(ctx) : false
        const done = detected || Boolean(progress.steps[i])
        return (
          <li key={i} className="flex gap-3">
            <span
              className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', done ? 'border-foreground bg-foreground text-background' : 'border-border')}
              aria-hidden
            >
              {done ? <Check className="h-3 w-3" /> : <span className="font-mono text-[10px]">{i + 1}</span>}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <span className="sr-only">{done ? 'Done: ' : `Step ${i + 1}: `}</span>
                {step.title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {step.action && (
                  <Button variant="outline" size="sm" onClick={() => step.action!.run(actions)}>
                    {step.action.label}
                  </Button>
                )}
                {!step.done && !done && (
                  <Button variant="ghost" size="sm" onClick={() => onTick(i)}>
                    <Circle className="mr-1.5 h-3 w-3" aria-hidden /> Mark as read
                  </Button>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Checkpoint({ lesson, ctx, passedBefore }: { lesson: Lesson; ctx: LessonContext; passedBefore: boolean }) {
  const passed = lesson.checkpoint.pass(ctx)
  const live = ctx.live
  const drifted = live && !passed && live.model !== lesson.checkpoint.model

  let extra: string | null = null
  if (lesson.slug === 'exact-checks' && live && ctx.variantId === 'works') {
    const { count, yes } = sumNouls(live.answers, 'item_')
    extra = `Code counted ${count}: ${yes.join(', ') || 'none'}.`
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="checkpoint-heading" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 id="checkpoint-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Checkpoint
        </h2>
        {passed ? (
          <Chip variant="success">passed</Chip>
        ) : passedBefore ? (
          <Chip variant="success">passed earlier</Chip>
        ) : (
          <Chip variant="outline">not yet</Chip>
        )}
      </div>
      <p className="mt-2 text-sm">{lesson.checkpoint.text}</p>
      {extra && <p className="mt-1 font-mono text-xs">{extra}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{lesson.checkpoint.expected}</p>
      {live && !passed && !passedBefore && (
        <p className="mt-2 text-xs text-muted-foreground">
          {drifted
            ? `Your run came from ${live.model}; this checkpoint was written against ${lesson.checkpoint.model}. Models move — if the steps are done, marking the lesson done is fair.`
            : 'Not on this run. The checkpoint tests a threshold, not an exact value, and a single run can miss it — try again, or mark the lesson done once you have seen why.'}
        </p>
      )}
      {!live && <p className="mt-2 text-xs text-muted-foreground">Checkpoints only read live runs, never replays.</p>}
    </section>
  )
}

function RecordedTable({ lesson, variantId }: { lesson: Lesson; variantId: string | null }) {
  const r = lesson.recorded
  if (!r) return null
  return (
    <section className="mt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recorded in the docs</h2>
      <table className="mt-2 w-full text-xs">
        <caption className="sr-only">Numbers recorded in {r.source}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-1.5 font-medium">{r.columns[0]}</th>
            <th scope="col" className="py-1.5 font-medium">{r.columns[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {r.rows.map((row) => {
            const here = row.variant && row.variant === variantId
            return (
              <tr key={row.label} className={cn(here && 'font-medium')}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {row.label}
                  {here && <span className="ml-1.5 text-muted-foreground">← loaded now</span>}
                </th>
                <td className="py-1.5 font-mono tabular">{row.value}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Source: {r.source}. A live run can differ.</p>
    </section>
  )
}

export function LessonView({ slug }: { slug: string }) {
  const lesson = LESSONS.find((l) => l.slug === slug)!
  const index = LESSONS.indexOf(lesson)
  const prev = LESSONS[index - 1]
  const next = LESSONS[index + 1]

  const { load, tab } = usePlayground()
  const [mounted, setMounted] = React.useState(false)
  const [startPolicy, setStartPolicy] = React.useState('')
  const [progress, setProgress] = React.useState<LessonProgress>({ steps: {}, done: false })

  React.useEffect(() => {
    const preset = getPreset(lesson.start.preset)
    if (preset) {
      load(presetToLoad(preset, lesson.start.variant))
      setStartPolicy(JSON.stringify(usePlayground.getState().policy))
    }
    setProgress(loadProgress()[lesson.slug] ?? { steps: {}, done: false })
    setMounted(true)
  }, [lesson, load])

  const ctx = useLessonContext(startPolicy, progress.steps)
  useRunShortcut()

  // Persist what the reader has done, so progress survives a reload.
  React.useEffect(() => {
    if (!mounted) return
    const detected: Record<number, boolean> = {}
    lesson.steps.forEach((s, i) => {
      if (s.done?.(ctx) && !progress.steps[i]) detected[i] = true
    })
    const checkpointNow = lesson.checkpoint.pass(ctx) && !progress.checkpoint
    if (Object.keys(detected).length || checkpointNow) {
      const next = saveProgress(lesson.slug, { steps: detected, ...(checkpointNow ? { checkpoint: true } : {}) })[lesson.slug]
      setProgress(next)
    }
  })

  const tick = (i: number) => setProgress(saveProgress(lesson.slug, { steps: { [i]: true } })[lesson.slug])
  const markDone = () => setProgress(saveProgress(lesson.slug, { done: true, doneAt: Date.now() })[lesson.slug])
  const everRanLive = Boolean(ctx.live) || Boolean(progress.checkpoint)

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <aside className="border-b border-border p-6 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <nav className="flex items-center justify-between text-xs text-muted-foreground" aria-label="Lessons">
          <Link href="/learn" className="hover:text-foreground">
            ← All lessons
          </Link>
          <span>
            {prev && (
              <Link href={`/learn/${prev.slug}`} className="hover:text-foreground">
                ‹ {prev.n}
              </Link>
            )}
            {prev && next && ' · '}
            {next && (
              <Link href={`/learn/${next.slug}`} className="hover:text-foreground">
                {next.n} ›
              </Link>
            )}
          </span>
        </nav>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Lesson {lesson.n} of {LESSONS.length} · {lesson.minutes} min
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="mt-3 text-[15px] font-medium leading-relaxed">{lesson.idea}</p>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{lesson.intro}</div>

        <h2 className="mt-7 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Steps</h2>
        <div className="mt-3">{mounted ? <Steps lesson={lesson} ctx={ctx} progress={progress} onTick={tick} /> : <Skeleton className="h-40 w-full" />}</div>

        <div className="mt-6">{mounted && <Checkpoint lesson={lesson} ctx={ctx} passedBefore={Boolean(progress.checkpoint)} />}</div>

        <RecordedTable lesson={lesson} variantId={ctx.variantId} />

        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">What to notice</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {lesson.notice.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>

        <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border pt-5">
          {progress.done ? (
            <Chip variant="success">Lesson done</Chip>
          ) : (
            <Button variant="outline" size="sm" onClick={markDone} disabled={!everRanLive} title={everRanLive ? undefined : 'Run the lesson live at least once first'}>
              Mark done
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/play?p=${lesson.start.preset}${lesson.start.variant ? `&v=${lesson.start.variant}` : ''}`}>Open in the playground</Link>
          </Button>
          {next ? (
            <Button size="sm" asChild className="ml-auto">
              <Link href={`/learn/${next.slug}`}>Next: {next.title} →</Link>
            </Button>
          ) : (
            <Button size="sm" asChild className="ml-auto">
              <Link href="/limits">On to the limits →</Link>
            </Button>
          )}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">{SITE.disclaimer}</p>
      </aside>

      <main id="main" className="flex min-h-[70vh] flex-col lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
        {mounted ? (
          <div className="grid min-h-0 flex-1 xl:grid-cols-2 xl:divide-x xl:divide-border">
            <div className="flex min-h-0 flex-col overflow-y-auto">
              <StateEditor />
              <QuestionsList />
              <div className="mt-auto">
                <LintBar />
                <RunBar />
              </div>
            </div>
            <div className="min-h-[50vh] border-t border-border xl:border-t-0">
              <ResultTabs>
                <ErrorCard />
                {tab === 'answers' && <AnswersTab />}
                {tab === 'policy' && <PolicyTab />}
                {tab === 'compare' && <CompareTab />}
                {tab === 'json' && <JsonTab />}
                {tab === 'code' && <CodeTab />}
              </ResultTabs>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 p-4 xl:grid-cols-2" aria-busy="true">
            <Skeleton className="h-[60vh] w-full" />
            <Skeleton className="h-[60vh] w-full" />
          </div>
        )}
      </main>
    </div>
  )
}
