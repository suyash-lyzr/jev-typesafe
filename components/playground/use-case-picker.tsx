'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Blocks, BookOpen, ChevronDown, DatabaseZap, FilePlus2, Search, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePlayground, type LoadInput } from '@/lib/store'
import {
  allPresets,
  DECISION_SHAPES,
  getPreset,
  getVariant,
  presetToLoad,
  USE_CASE_GROUP_BLURB,
  USE_CASE_GROUP_LABEL,
  USE_CASE_GROUPS,
  USE_CASE_SLUGS,
  type Preset,
  type UseCaseGroup,
} from '@/content/presets'

/**
 * Step 1 lives in the app bar: one button naming the current use case, which
 * opens a panel with a search box, a row of category filters (TypeSafe's
 * use-case map, docs.typesafe.ai/concepts/use-case-map, plus the docs' own
 * requests) and a grid of use cases. Nothing slides in from the side.
 */

const GROUP_ICON: Record<UseCaseGroup, LucideIcon> = {
  automation: Blocks,
  realtime: Zap,
  bigdata: DatabaseZap,
  verification: BadgeCheck,
  harness: Wrench,
}

/** Literal class strings so Tailwind keeps them. */
const GROUP_TINT: Record<UseCaseGroup, string> = {
  automation: 'bg-[hsl(var(--cat-automation)/0.12)] text-[hsl(var(--cat-automation))]',
  realtime: 'bg-[hsl(var(--cat-realtime)/0.14)] text-[hsl(var(--cat-realtime))]',
  bigdata: 'bg-[hsl(var(--cat-bigdata)/0.12)] text-[hsl(var(--cat-bigdata))]',
  verification: 'bg-[hsl(var(--cat-verification)/0.12)] text-[hsl(var(--cat-verification))]',
  harness: 'bg-[hsl(var(--cat-harness)/0.12)] text-[hsl(var(--cat-harness))]',
}

/** Short names for the filter row; the full names sit in the section headings. */
const GROUP_SHORT: Record<UseCaseGroup, string> = {
  automation: 'Automation',
  realtime: 'Real-time',
  bigdata: 'Big data',
  verification: 'Verification',
  harness: 'Harness',
}

export function CategoryIcon({ group, className }: { group: UseCaseGroup; className?: string }) {
  const Icon = GROUP_ICON[group]
  return (
    <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', GROUP_TINT[group], className)} aria-hidden>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

export function shapeLabel(preset: Preset): string | null {
  return DECISION_SHAPES.find((s) => s.id === preset.shape)?.label ?? null
}

function matches(preset: Preset, q: string): boolean {
  if (!q) return true
  const hay = [preset.title, preset.industry, preset.teaches, shapeLabel(preset), preset.group && USE_CASE_GROUP_LABEL[preset.group]]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w))
}

type Filter = 'all' | UseCaseGroup | 'docs'

const USE_CASES = USE_CASE_SLUGS.map((s) => getPreset(s)!).filter(Boolean)
const DOC_PRESETS = allPresets.filter((p) => p.category !== 'usecase')

function PickerItem({ preset, selected, onPick }: { preset: Preset; selected: boolean; onPick: () => void }) {
  const shape = shapeLabel(preset)
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={onPick}
        className={cn(
          'group flex h-full w-full flex-col rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-fast',
          selected ? 'border-brand/50 bg-brand-soft' : 'border-border bg-card hover:border-faint/60 hover:bg-muted/40'
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className={cn('text-[13px] font-medium leading-snug', selected ? 'text-brand-text' : 'text-foreground')}>{preset.title}</span>
        </span>
        <span className="mt-0.5 line-clamp-1 text-[11.5px] text-faint">
          {preset.industry ? `${preset.industry}${shape ? ` · ${shape}` : ''}` : preset.teaches}
        </span>
      </button>
    </li>
  )
}

export function UseCasePicker({ onPick }: { onPick: (input: LoadInput) => void }) {
  const { presetId, title } = usePlayground()
  const current = presetId ? getPreset(presetId) : null
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [filter, setFilter] = React.useState<Filter>(current?.category === 'usecase' || !current ? 'all' : 'docs')

  const pick = (input: LoadInput) => {
    setOpen(false)
    setQuery('')
    onPick(input)
  }

  const q = query.trim()
  const pool = filter === 'docs' ? DOC_PRESETS : USE_CASES
  const shown = pool.filter((p) => (filter === 'all' || filter === 'docs' || p.group === filter) && matches(p, q))
  const sections: Array<{ key: string; group?: UseCaseGroup; items: Preset[] }> =
    filter === 'docs'
      ? [{ key: 'docs', items: shown }]
      : USE_CASE_GROUPS.map((g) => ({ key: g, group: g, items: shown.filter((p) => p.group === g) })).filter((s) => s.items.length)

  const chip = (value: Filter, label: string, count: number, icon?: React.ReactNode) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors duration-fast',
        filter === value
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:border-faint hover:text-foreground'
      )}
    >
      {icon}
      {label}
      <span className={cn('font-mono text-[10.5px]', filter === value ? 'text-background/70' : 'text-faint')}>{count}</span>
    </button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-[10px] border border-border bg-card pl-1.5 pr-2.5 text-left shadow-[0_1px_2px_hsl(222_47%_11%/0.05)] transition-colors duration-fast hover:border-faint data-[state=open]:border-brand/50 data-[state=open]:ring-2 data-[state=open]:ring-brand/15"
          aria-label={`Use case: ${current?.title ?? title}. Change use case`}
        >
          {current?.group ? (
            <CategoryIcon group={current.group} className="h-6 w-6 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5" />
          ) : (
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-faint" aria-hidden>
              <BookOpen className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="truncate text-[13.5px] font-medium">{current?.title ?? title ?? 'Your request'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-fast group-data-[state=open]:rotate-180" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(780px,calc(100vw-24px))] overflow-hidden rounded-[14px] border-border p-0 shadow-float"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchRef.current?.focus()
        }}
      >
        {/* Search + filters */}
        <div className="border-b border-border bg-results px-3 pb-2.5 pt-3">
          <label className="relative block">
            <span className="sr-only">Search use cases</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${USE_CASES.length} use cases, e.g. fraud, routing, legal`}
              className="h-9 w-full rounded-[10px] border border-input bg-card pl-8 pr-3 text-[13px] placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            {chip('all', 'All', USE_CASES.length)}
            {USE_CASE_GROUPS.map((g) =>
              chip(
                g,
                GROUP_SHORT[g],
                USE_CASES.filter((p) => p.group === g).length,
                <CategoryIcon group={g} className="h-4 w-4 rounded-full bg-transparent [&_svg]:h-3 [&_svg]:w-3" />
              )
            )}
            {chip('docs', 'From the docs', DOC_PRESETS.length, <BookOpen className="h-3 w-3" aria-hidden />)}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[min(460px,60vh)] overflow-y-auto px-3 py-3">
          {sections.length === 0 && (
            <p className="py-6 text-center text-[13px] text-faint">Nothing matches &ldquo;{query}&rdquo;.</p>
          )}
          {sections.map((section) => (
            <section key={section.key} className="mb-3 last:mb-0" aria-label={section.group ? USE_CASE_GROUP_LABEL[section.group] : 'From the docs'}>
              {filter !== 'docs' && section.group && (
                <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
                  <h3 className="shrink-0 text-[12px] font-semibold text-foreground">{USE_CASE_GROUP_LABEL[section.group]}</h3>
                  <p className="hidden truncate text-[11.5px] text-faint sm:block">{USE_CASE_GROUP_BLURB[section.group]}</p>
                </div>
              )}
              {filter === 'docs' && (
                <p className="mb-2 px-0.5 text-[11.5px] text-faint">The requests TypeSafe&rsquo;s docs use, with the numbers they print. Several have variants.</p>
              )}
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((preset) => (
                  <PickerItem
                    key={preset.slug}
                    preset={preset}
                    selected={preset.slug === presetId}
                    onPick={() => (preset.slug === presetId ? setOpen(false) : pick(presetToLoad(preset)))}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-results px-3 py-2 text-[12.5px]">
          <button
            type="button"
            onClick={() => pick({ state: '', questions: {}, title: 'Blank request', presetId: null })}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden /> Start from a blank request
          </button>
          <Link href="/presets" className="ml-auto text-brand hover:underline" onClick={() => setOpen(false)}>
            Browse all →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * One step along the catalogue: the use case after the current one, wrapping
 * at the end. Docs presets step through the docs presets; anything else
 * (a blank or shared request) starts at the first use case.
 */
export function NextUseCaseButton({ onPick }: { onPick: (input: LoadInput) => void }) {
  const presetId = usePlayground((s) => s.presetId)
  const current = presetId ? getPreset(presetId) : null
  const list = current && current.category !== 'usecase' ? DOC_PRESETS : USE_CASES
  const i = current ? list.findIndex((p) => p.slug === current.slug) : -1
  const next = list[(i + 1) % list.length]

  return (
    <button
      type="button"
      onClick={() => onPick(presetToLoad(next))}
      title={`Next: ${next.title}`}
      aria-label={`Try the next use case: ${next.title}`}
      className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
    >
      <span className="hidden lg:inline">Try next</span>
      <span className="hidden max-w-[140px] truncate text-faint group-hover:text-muted-foreground xl:inline">· {next.title}</span>
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}

/** The top of the editor: what this use case is, in one line or two. */
export function UseCaseHeader({ onPick }: { onPick: (input: LoadInput) => void }) {
  const { presetId, variantId } = usePlayground()
  const preset = presetId ? getPreset(presetId) : null
  const variant = preset ? getVariant(preset, variantId ?? undefined) : null
  const shape = preset ? shapeLabel(preset) : null

  return (
    <section className="px-5 pb-1 pt-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {preset?.group && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', GROUP_TINT[preset.group])}>
            {GROUP_SHORT[preset.group]}
          </span>
        )}
        {preset?.industry && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{preset.industry}</span>
        )}
        {shape && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{shape}</span>}
      </div>
      <p className="mt-2.5 text-[14px] leading-relaxed text-foreground/80">
        {preset?.teaches ?? 'A request of your own. Edit the state and questions, then run it.'}
        {variant?.description && <span className="text-faint"> {variant.description}</span>}
      </p>
      {preset && preset.variants.length > 1 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1" role="group" aria-label="Variants">
          <span className="mr-1 text-xs text-faint">Variant</span>
          {preset.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={variantId === v.id}
              title={v.description}
              onClick={() => variantId !== v.id && onPick(presetToLoad(preset, v.id))}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs transition-colors duration-fast',
                variantId === v.id ? 'bg-brand-soft font-medium text-brand-text' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
