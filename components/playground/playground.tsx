'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { History, LayoutGrid, Share2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { ImperativePanelGroupHandle } from 'react-resizable-panels'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StateEditor, QuestionsList, LintBar, RunBar } from './editor-pane'
import { ResultTabs, AnswersTab, ErrorCard } from './result-pane'
import { PolicyTab, JsonTab, CodeTab } from './policy-tab'
import { CompareTab } from './compare-tab'
import { ShareDialog } from './share-dialog'
import { useRunShortcut, useShareShortcut, useModKey } from './use-mod-key'
import { usePlayground, type LoadInput } from '@/lib/store'
import { decodeShare } from '@/lib/share'
import { editorRequestHash } from '@/lib/serialize'
import { loadRuns, clearRuns, loadSettings, saveSettings, type RunRecord } from '@/lib/storage'
import { getPreset, presetToLoad, allPresets } from '@/content/presets'
import { formatUsd } from '@/lib/pricing'

/**
 * The playground screen.
 *
 * Everything that reads the URL or localStorage happens after mount, behind a
 * skeleton, so the server-rendered shell never disagrees with what the browser
 * ends up showing. Nothing here runs a request on its own: a URL can load a
 * request and switch Compare on, never press Run. The single exception is a
 * one-shot token our own "Run the comparison" launchers put in sessionStorage.
 */

export const AUTORUN_KEY = 'jevlab.autorun.once'

/** The lg breakpoint, as JS: exactly one layout is ever mounted. */
const DESKTOP_QUERY = '(min-width: 1024px)'

function useIsDesktop(): boolean | null {
  const [desktop, setDesktop] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const sync = () => setDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return desktop
}

/** Unsaved edits are anything that differs from what was last loaded. */
function useHasEdits() {
  const { baselineHash, editorRequest } = usePlayground()
  return () => editorRequestHash(editorRequest()) !== baselineHash
}

function PresetsPanel({ onPick }: { onPick: (input: LoadInput) => void }) {
  return (
    <div className="space-y-4">
      <button
        onClick={() => onPick({ state: '', questions: {}, title: 'Blank request', presetId: null })}
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
                onClick={() => onPick(presetToLoad(preset, variant.id))}
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

function RecentPanel({ onPick }: { onPick: (run: RunRecord) => void }) {
  const [runs, setRuns] = React.useState<RunRecord[]>([])
  React.useEffect(() => setRuns(loadRuns()), [])

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet in this browser.</p>
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <button key={run.id} onClick={() => onPick(run)} className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent">
          <span className="block truncate text-sm">{run.title}</span>
          <span className="block font-mono text-xs tabular text-muted-foreground">
            {run.model} · {run.timing.jevMs} ms · {formatUsd(run.costUsd)}
            {run.stateTruncated ? ' · state not kept' : ''}
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
  const { tab, load, restoreRun, run, running, announcement, title, presetId, variantId } = usePlayground()
  const hasEdits = useHasEdits()

  const [mounted, setMounted] = React.useState(false)
  const [shareOpen, setShareOpen] = React.useState(false)
  const [panel, setPanel] = React.useState<'presets' | 'recent' | null>(null)
  const [mobileView, setMobileView] = React.useState<'edit' | 'results'>('edit')
  const isDesktop = useIsDesktop()
  const selectedQuestion = usePlayground((s) => s.selectedQuestion)
  const [split, setSplit] = React.useState(50)
  const panels = React.useRef<ImperativePanelGroupHandle>(null)
  /** A load waiting for the reader to confirm discarding their edits. */
  const [pending, setPending] = React.useState<(() => void) | null>(null)

  /** Anything that replaces the editor asks first when there are unsaved edits. */
  const guarded = React.useCallback(
    (action: () => void) => {
      if (hasEdits()) setPending(() => action)
      else action()
    },
    [hasEdits]
  )

  // --- load from the URL, once ---------------------------------------------
  React.useEffect(() => {
    setSplit(Math.round((loadSettings().splitRatio || 0.5) * 100))

    // The store outlives client-side navigation. Coming back to /play must not
    // silently replace what the reader left in the editor.
    const current = usePlayground.getState()
    const returning = current.loadCount > 0
    const dirty = returning && editorRequestHash(current.editorRequest()) !== current.baselineHash
    const ask = (action: () => void) => (dirty ? setPending(() => action) : action())

    const hash = window.location.hash
    if (hash.startsWith('#s=')) {
      const decoded = decodeShare(hash.slice(3))
      if (decoded.ok) {
        const e = decoded.envelope
        ask(() => load({
          state: e.state,
          stateMode: e.stateMode,
          model: e.model,
          questions: e.questions,
          variants: e.variants,
          policy: e.policy,
          title: e.title ?? 'Shared request',
          presetId: null,
          compare: e.compare,
          notice: 'Shared request, not yet run. Nothing runs until you press Run.',
        }))
      } else if (!dirty) {
        load({
          state: '',
          questions: {},
          title: 'Blank request',
          notice:
            decoded.reason === 'newer-version'
              ? 'This link was made by a newer version of Jev Lab. Reload the page and try again.'
              : 'That shared link could not be read, so the editor starts blank.',
        })
      }
      // Clear the fragment so a refresh does not re-apply a stale request.
      history.replaceState(null, '', window.location.pathname + window.location.search)
      setMounted(true)
      return
    }

    const requested = params.get('p')
    const compare = params.get('compare') === '1'

    // Back on /play with nothing asked for: keep whatever is in the editor.
    if (!requested && returning) {
      if (compare) current.setCompareOn(true)
      setMounted(true)
      return
    }

    const preset = getPreset(requested ?? 'first-run')
    if (preset) {
      ask(() => load({
        ...presetToLoad(preset, params.get('v') ?? undefined, { compare }),
        notice: requested
          ? compare
            ? 'Compare is on for this preset. Press Run to send it to Jev and the LLM together.'
            : null
          : 'Loaded the first-run preset. Pick another from Presets, or start blank.',
      }))
    } else {
      const first = getPreset('first-run')!
      ask(() =>
        load({ ...presetToLoad(first, undefined, { compare }), notice: `There is no preset called "${requested}". Loaded the first-run preset instead.` })
      )
    }
    setMounted(true)
    // Intentionally once: later changes come from explicit actions on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- one-shot autorun, only ever set by our own launchers ----------------
  React.useEffect(() => {
    if (!mounted) return
    let token: string | null = null
    try {
      token = sessionStorage.getItem(AUTORUN_KEY)
      if (token) sessionStorage.removeItem(AUTORUN_KEY)
    } catch {
      return
    }
    // A pending "replace your edits?" means the launcher's preset is not loaded.
    if (!token || pending) return
    const [slug, mode] = token.split(':')
    if (slug === presetId) run({ compare: mode === 'compare' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // --- on small screens, show results as soon as a run starts --------------
  React.useEffect(() => {
    if (running && isDesktop === false) setMobileView('results')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // --- and "Show question" goes to the editor, where the question is -------
  React.useEffect(() => {
    if (selectedQuestion && isDesktop === false) setMobileView('edit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuestion])

  useRunShortcut()
  useShareShortcut(() => setShareOpen(true))
  const mod = useModKey()

  if (!mounted) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-2" aria-busy="true">
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
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* App bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <h1 className="truncate text-sm font-medium">{title}</h1>

        {preset && preset.variants.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Variants">
            {preset.variants.map((variant) => (
              <button
                key={variant.id}
                title={variant.description}
                aria-pressed={variantId === variant.id}
                onClick={() => guarded(() => load(presetToLoad(preset, variant.id)))}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors duration-fast',
                  variantId === variant.id ? 'border-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent'
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
                <LayoutGrid className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Presets
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-[360px]">
              <SheetHeader>
                <SheetTitle>Presets</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <PresetsPanel
                  onPick={(input) => {
                    setPanel(null)
                    guarded(() => load(input))
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={panel === 'recent'} onOpenChange={(v) => setPanel(v ? 'recent' : null)}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Recent
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-[360px]">
              <SheetHeader>
                <SheetTitle>Recent runs</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <RecentPanel
                  onPick={(record) => {
                    setPanel(null)
                    guarded(() => restoreRun(record))
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} aria-keyshortcuts="Meta+S Control+S">
            <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Share
            <span className="ml-1.5 hidden font-mono text-[10px] text-muted-foreground xl:inline" aria-hidden>
              {mod}S
            </span>
          </Button>

          {preset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => guarded(() => load(presetToLoad(preset, variantId ?? undefined)))}
              title="Restore this preset's starting point. Your runs stay in Recent."
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* Small screens: one pane at a time */}
      <div className="border-b border-border px-4 py-2 lg:hidden">
        <SegmentedControl value={mobileView} onValueChange={(v) => setMobileView(v as 'edit' | 'results')} aria-label="Playground view">
          <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
          <SegmentedControlItem value="results">Results</SegmentedControlItem>
        </SegmentedControl>
      </div>

      <main id="main" className="min-h-0 flex-1">
        {/* One tree, never two hidden by CSS: a second, invisible editor
            echoed every edit back and rewrote the visible one's text. */}
        {isDesktop === false && <div className="h-full">{mobileView === 'edit' ? editor : results}</div>}

        {isDesktop && (
          <ResizablePanelGroup
            ref={panels}
            direction="horizontal"
            onLayout={(sizes) => {
              const left = sizes[0]
              if (typeof left === 'number' && Math.abs(left - split) >= 1) {
                setSplit(left)
                saveSettings({ splitRatio: left / 100 })
              }
            }}
          >
            <ResizablePanel defaultSize={split} minSize={30}>
              {editor}
            </ResizablePanel>
            <ResizableHandle
              withHandle
              aria-label="Resize the editor and results panes. Double-click to reset."
              onDoubleClick={() => {
                panels.current?.setLayout([50, 50])
                saveSettings({ splitRatio: 0.5 })
              }}
            />
            <ResizablePanel defaultSize={100 - split} minSize={30}>
              {results}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </main>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />

      {/* A real dialog: role, focus trap and Escape come from Radix, and the
          run shortcut sees it and stays quiet while it is open. */}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Replace your edits?</DialogTitle>
            <DialogDescription>
              Loading this replaces what is in the editor. Anything you have run is kept in Recent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} autoFocus>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                pending?.()
                setPending(null)
              }}
            >
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
