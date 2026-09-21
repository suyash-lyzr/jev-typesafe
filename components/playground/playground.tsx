'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { History, LayoutGrid, Share2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import { StateEditor, QuestionsList, LintBar, RunBar } from './editor-pane'
import { ResultTabs, AnswersTab, ErrorCard } from './result-pane'
import { PolicyTab, JsonTab, CodeTab } from './policy-tab'
import { CompareTab } from './compare-tab'
import { ShareDialog } from './share-dialog'
import { usePlayground } from '@/lib/store'
import { decodeShare } from '@/lib/share'
import { loadRuns, clearRuns, type RunRecord } from '@/lib/storage'
import { getPreset, presetToLoad, allPresets } from '@/content/presets'
import { formatUsd } from '@/lib/pricing'

/**
 * The playground screen.
 *
 * Everything that reads the URL or localStorage happens after mount, behind a
 * skeleton, so the server-rendered shell never disagrees with what the browser
 * ends up showing.
 */

function PresetsPanel({ onPick }: { onPick: () => void }) {
  const { load } = usePlayground()

  return (
    <div className="space-y-4">
      <button
        onClick={() => {
          load({ state: '', questions: {}, title: 'Blank request', presetId: null })
          onPick()
        }}
        className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
      >
        Blank request
        <span className="block text-xs text-muted-foreground">Start from nothing.</span>
      </button>

      {allPresets.map((preset) => (
        <div key={preset.slug}>
          <p className="mb-1 text-[13px] font-medium">{preset.title}</p>
          <p className="mb-1.5 text-xs text-muted-foreground">{preset.teaches}</p>
          <div className="flex flex-wrap gap-1">
            {preset.variants.map((variant) => (
              <button
                key={variant.id}
                onClick={() => {
                  load(presetToLoad(preset, variant.id))
                  onPick()
                }}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                title={variant.description}
              >
                {variant.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentPanel({ onPick }: { onPick: () => void }) {
  const { load } = usePlayground()
  const [runs, setRuns] = React.useState<RunRecord[]>([])

  React.useEffect(() => setRuns(loadRuns()), [])

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet in this browser.</p>
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => {
            load({
              state: run.request.state,
              model: run.request.model,
              questions: run.request.questions,
              title: run.title,
              presetId: run.presetId ?? null,
              recorded: {
                answers: run.answers,
                request: run.request,
                model: run.model,
                usage: run.usage,
                timing: run.timing,
                clientMs: run.timing.serverMs,
                costUsd: run.costUsd,
                replay: true,
                hash: '',
                compare: run.compare,
              },
            })
            onPick()
          }}
          className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
        >
          <span className="block truncate text-sm">{run.title}</span>
          <span className="block font-mono text-xs tabular text-muted-foreground">
            {run.model} · {run.timing.jevMs} ms · {formatUsd(run.costUsd)}
          </span>
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          clearRuns()
          setRuns([])
        }}
      >
        Clear recent runs
      </Button>
    </div>
  )
}

export function Playground() {
  const params = useSearchParams()
  const store = usePlayground()
  const { tab, load, run, announcement, title, presetId, variantId } = store

  const [mounted, setMounted] = React.useState(false)
  const [shareOpen, setShareOpen] = React.useState(false)
  const [sharedNotice, setSharedNotice] = React.useState<string | null>(null)
  const [panel, setPanel] = React.useState<'presets' | 'recent' | null>(null)
  const [mobileView, setMobileView] = React.useState<'edit' | 'results'>('edit')

  // --- load from the URL, once ---------------------------------------------
  React.useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''

    if (hash.startsWith('#s=')) {
      const decoded = decodeShare(hash.slice(3))
      if (decoded.ok) {
        const e = decoded.envelope
        load({
          state: e.state,
          stateMode: e.stateMode,
          model: e.model,
          questions: e.questions,
          variants: e.variants,
          policy: e.policy as never,
          title: e.title ?? 'Shared request',
          presetId: null,
          compare: e.compare,
        })
        setSharedNotice('Shared request · not yet run. Nothing runs until you press Run.')
      } else {
        setSharedNotice(
          decoded.reason === 'newer-version'
            ? 'This link was made by a newer version of Jev Lab. Reload the page and try again.'
            : 'That shared link could not be read.'
        )
      }
      // Clear the fragment so a refresh does not re-apply a stale request.
      history.replaceState(null, '', window.location.pathname + window.location.search)
      setMounted(true)
      return
    }

    const slug = params.get('p') ?? 'first-run'
    const preset = getPreset(slug)
    if (preset) {
      load(presetToLoad(preset, params.get('v') ?? undefined))
      if (!params.get('p')) {
        setSharedNotice('Loaded the first-run preset. Pick another from Presets, or start blank.')
      }
    }
    setMounted(true)
    // Intentionally once: later param changes are handled by explicit navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- autorun token, only ever set by our own launchers -------------------
  React.useEffect(() => {
    if (!mounted) return
    const token = sessionStorage.getItem('jevlab.autorun.once')
    if (!token) return
    sessionStorage.removeItem('jevlab.autorun.once')
    const [slug, mode] = token.split(':')
    if (slug === presetId) run({ compare: mode === 'compare' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, presetId])

  // --- keyboard ------------------------------------------------------------
  React.useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return

      if (e.key === 'Enter') {
        e.preventDefault()
        run()
      }
      // Shift-prefixed so the browser's own Save and Downloads keep working.
      if (e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setShareOpen(true)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  if (!mounted) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <Skeleton className="h-[70vh] w-full" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    )
  }

  const preset = presetId ? getPreset(presetId) : null

  const editor = (
    <div className="flex h-full flex-col overflow-y-auto">
      <StateEditor />
      <QuestionsList />
      <div className="mt-auto">
        <LintBar />
        <RunBar />
      </div>
    </div>
  )

  const results = (
    <ResultTabs>
      <ErrorCard />
      {tab === 'answers' && <AnswersTab />}
      {tab === 'policy' && <PolicyTab />}
      {tab === 'compare' && <CompareTab />}
      {tab === 'json' && <JsonTab />}
      {tab === 'code' && <CodeTab />}
    </ResultTabs>
  )

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* App bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="truncate text-sm font-medium">{title}</span>

        {preset && preset.variants.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {preset.variants.map((variant) => (
              <button
                key={variant.id}
                title={variant.description}
                onClick={() => load(presetToLoad(preset, variant.id))}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors duration-fast',
                  variantId === variant.id
                    ? 'border-foreground font-medium'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {variant.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Sheet open={panel === 'presets'} onOpenChange={(v) => setPanel(v ? 'presets' : null)}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Presets
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[360px] overflow-y-auto sm:max-w-[360px]">
              <SheetHeader>
                <SheetTitle>Presets</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <PresetsPanel onPick={() => setPanel(null)} />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={panel === 'recent'} onOpenChange={(v) => setPanel(v ? 'recent' : null)}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="mr-1.5 h-3.5 w-3.5" /> Recent
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[360px] overflow-y-auto sm:max-w-[360px]">
              <SheetHeader>
                <SheetTitle>Recent runs</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <RecentPanel onPick={() => setPanel(null)} />
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
          </Button>

          {preset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(presetToLoad(preset, variantId ?? undefined))}
              title="Restore this preset's starting point. Your run stays in Recent."
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {sharedNotice && (
        <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
          {sharedNotice}
          <button
            onClick={() => setSharedNotice(null)}
            className="ml-2 text-brand underline-offset-2 hover:underline"
          >
            dismiss
          </button>
        </p>
      )}

      {/* Mobile switcher */}
      <div className="border-b border-border px-4 py-2 lg:hidden">
        <SegmentedControl
          value={mobileView}
          onValueChange={(v) => setMobileView(v as 'edit' | 'results')}
        >
          <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
          <SegmentedControlItem value="results">Results</SegmentedControlItem>
        </SegmentedControl>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2 lg:divide-x lg:divide-border">
        <div className={cn('min-h-0', mobileView === 'edit' ? 'block' : 'hidden lg:block')}>
          {editor}
        </div>
        <div className={cn('min-h-0', mobileView === 'results' ? 'block' : 'hidden lg:block')}>
          {results}
        </div>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
