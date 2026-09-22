'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePlayground } from '@/lib/store'
import { LLM_MODELS, LLM_PRICES_CHECKED_ON, findLlmModel } from '@/lib/llm-models'
import { loadSettings } from '@/lib/storage'

/** Fetch the quota and restore the saved model once, wherever the controls first appear. */
export function useCompareSetup() {
  const { compareQuota, fetchCompareQuota, setCompareModel } = usePlayground()
  React.useEffect(() => {
    const saved = loadSettings().compareModel
    if (saved && findLlmModel(saved)) setCompareModel(saved)
    if (!compareQuota) fetchCompareQuota()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const price = (n: number) => (n < 1 ? `$${n.toFixed(2)}` : `$${n % 1 ? n.toFixed(2) : n}`)

/** "vs gpt-5.6-terra ▾" — the OpenAI model the next comparison runs against. */
export function LlmPicker({ className, bare = false }: { className?: string; bare?: boolean }) {
  const { compareModel, setCompareModel } = usePlayground()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Comparison model: ${compareModel}. Change`}
          className={cn(
            'group inline-flex h-8 items-center gap-1.5 text-[12.5px] transition-colors duration-fast',
            bare
              ? 'rounded-full px-2 hover:bg-muted data-[state=open]:bg-muted'
              : 'rounded-full border border-border bg-card px-3 hover:border-faint data-[state=open]:border-foreground/40',
            className
          )}
        >
          <span className="text-muted-foreground">vs</span>
          <span className="font-mono font-medium">{compareModel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-faint transition-transform duration-fast group-data-[state=open]:rotate-180" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-[320px] rounded-[12px] p-1.5">
        <div className="flex items-baseline justify-between px-2 pb-1.5 pt-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Compare against</span>
          <span className="font-mono text-[10px] text-faint">per 1M tokens · in / out</span>
        </div>
        {LLM_MODELS.map((m) => {
          const on = m.id === compareModel
          return (
            <DropdownMenuItem
              key={m.id}
              onClick={() => setCompareModel(m.id)}
              className={cn('flex items-center gap-2.5 rounded-[8px] px-2 py-1.5', on && 'bg-muted')}
            >
              <span
                className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border', on ? 'border-foreground bg-foreground' : 'border-input')}
                aria-hidden
              >
                {on && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[12.5px] font-medium">{m.id}</span>
                <span className="block text-[11px] text-muted-foreground">{m.note}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular text-muted-foreground">
                {price(m.inPerM)} / {price(m.outPerM)}
              </span>
            </DropdownMenuItem>
          )
        })}
        <p className="px-2 pb-1 pt-1.5 text-[10.5px] leading-snug text-faint">
          OpenAI list prices, checked {LLM_PRICES_CHECKED_ON}. Jev: $0.042 in, output free.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "3 of 5 left today" — or, at zero, when they come back. */
export function QuotaNote({ className }: { className?: string }) {
  const q = usePlayground((s) => s.compareQuota)
  if (!q) return null
  if (q.owner) return <span className={cn('font-mono text-[11px] text-muted-foreground', className)}>owner · unlimited</span>
  const out = q.remaining === 0
  return (
    <span
      className={cn('font-mono text-[11px] tabular', out ? 'text-warning-text' : 'text-muted-foreground', className)}
      title={`Free comparisons from this network today. They reset at 00:00 UTC.`}
    >
      {out ? 'none left today · resets 00:00 UTC' : `${q.remaining} of ${q.limit} left today`}
    </span>
  )
}

/** Five small dots: filled for each free comparison left today. */
export function QuotaDots({ className }: { className?: string }) {
  const q = usePlayground((s) => s.compareQuota)
  if (!q) return null
  if (q.owner) {
    return (
      <span className={cn('font-mono text-[11px] text-muted-foreground', className)} title="Owner pass: no daily comparison limit in this browser">
        owner · unlimited
      </span>
    )
  }
  const label = q.remaining === 0 ? 'No free comparisons left today — they reset at 00:00 UTC' : `${q.remaining} of ${q.limit} free comparisons left today`
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} role="img" aria-label={label} title={label}>
      {Array.from({ length: q.limit }, (_, i) => (
        <span
          key={i}
          className={cn('h-[6px] w-[6px] rounded-full transition-colors', i < q.remaining ? 'bg-foreground' : 'bg-foreground/15')}
        />
      ))}
      <span className="ml-1.5 font-mono text-[11px] tabular text-muted-foreground" aria-hidden>
        {q.remaining === 0 ? '0 left' : `${q.remaining} left`}
      </span>
    </span>
  )
}
