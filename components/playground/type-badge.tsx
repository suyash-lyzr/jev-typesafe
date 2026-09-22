import { cn } from '@/lib/utils'
import type { QuestionType } from '@/lib/schema'

/**
 * The question type, impossible to miss: every question and every answer
 * carries one. The title says what the type returns, in plain words.
 */

export const TYPE_MEANING: Record<QuestionType, string> = {
  choice: 'picks one of your options',
  noul: 'the probability of yes',
  score: 'a point on your scale',
}

/** Each type keeps its own hue everywhere it appears. */
const TYPE_TONE: Record<QuestionType, string> = {
  choice: 'border-[hsl(var(--type-choice)/0.25)] bg-[hsl(var(--type-choice-soft))] text-[hsl(var(--type-choice))]',
  noul: 'border-[hsl(var(--type-noul)/0.25)] bg-[hsl(var(--type-noul-soft))] text-[hsl(var(--type-noul))]',
  score: 'border-[hsl(var(--type-score)/0.25)] bg-[hsl(var(--type-score-soft))] text-[hsl(var(--type-score))]',
}

export function TypeBadge({ type, className }: { type: QuestionType; className?: string }) {
  return (
    <span
      title={`${type.toUpperCase()}: ${TYPE_MEANING[type]}`}
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center rounded-md border px-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em]',
        TYPE_TONE[type],
        className
      )}
    >
      {type}
    </span>
  )
}

/** The three types, explained once where questions are written. */
export function TypeLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground', className)}>
      {(['choice', 'noul', 'score'] as QuestionType[]).map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <TypeBadge type={t} className="h-5 text-[10px]" />
          {TYPE_MEANING[t]}
        </li>
      ))}
    </ul>
  )
}

export function StepLabel({ n, children, id, className }: { n?: number; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn('flex items-center gap-2 font-display text-[14px] font-semibold tracking-[-0.01em] text-foreground', className)}>
      {n != null && <StepNumber n={n} />}
      {children}
    </h2>
  )
}

/** The blue numbered dot that marks each playground step. */
export function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-[11px] font-semibold text-background"
      aria-hidden
    >
      {n}
    </span>
  )
}
