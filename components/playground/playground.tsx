'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, History, Share2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { NextUseCaseButton, UseCaseHeader, UseCasePicker } from './use-case-picker'
import { StepNumber } from './type-badge'
import { ResultTabs, AnswersTab, ErrorCard } from './result-pane'
import { PolicyTab, JsonTab, CodeTab } from './policy-tab'
import { CompareTab } from './compare-tab'
import { ShareDialog } from './share-dialog'
import { useRunShortcut, useShareShortcut, useModKey } from './use-mod-key'
import { usePlayground, type LoadInput } from '@/lib/store'
import { decodeShare } from '@/lib/share'
import { editorRequestHash } from '@/lib/serialize'
import { loadRuns, clearRuns, loadSettings, saveSettings, type RunRecord } from '@/lib/storage'
import { getPreset, presetToLoad } from '@/content/presets'
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

/** What /play opens on when the URL asks for nothing. */
const DEFAULT_USE_CASE = 'support-ticket'

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

function RecentPanel({ onPick }: { onPick: (run: RunRecord) => void }) {
  const [runs, setRuns] = React.useState<RunRecord[]>([])
  React.useEffect(() => setRuns(loadRuns()), [])

  if (runs.length === 0) {
    return <p className="px-1 py-2 text-[13px] text-muted-foreground">No runs yet in this browser.</p>
  }

  return (
    <div>
      <ul className="max-h-[360px] space-y-0.5 overflow-y-auto">
      {runs.map((run) => (
        <li key={run.id}>
        <button onClick={() => onPick(run)} className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted">
          <span className="block truncate text-[13px] font-medium">{run.title}</span>
          <span className="block font-mono text-xs tabular text-muted-foreground">
            {run.model} · {run.timing.jevMs} ms · {formatUsd(run.costUsd)}
            {run.stateTruncated ? ' · state not kept' : ''}
          </span>
        </button>
        </li>
      ))}
      </ul>
      <Button
        className="mt-1"
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
  const { tab, load, restoreRun, run, running, announcement, presetId, variantId } = usePlayground()
  const hasEdits = useHasEdits()

  const [mounted, setMounted] = React.useState(false)
  const [shareOpen, setShareOpen] = React.useState(false)
  const [recentOpen, setRecentOpen] = React.useState(false)
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

    const preset = getPreset(requested ?? DEFAULT_USE_CASE)
    if (preset) {
      ask(() => load({
        ...presetToLoad(preset, params.get('v') ?? undefined, { compare }),
        notice: requested
          ? compare
            ? 'Compare is on for this preset. Press Run to send it to Jev and the LLM together.'
            : null
          : null,
      }))
    } else {
      const first = getPreset(DEFAULT_USE_CASE)!
      ask(() =>
        load({ ...presetToLoad(first, undefined, { compare }), notice: `There is no preset called "${requested}". Loaded the support-ticket example instead.` })
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
      <div className="grid max-md:grid-cols-1 gap-4 p-4 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-[70vh] w-full" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    )
  }

  const preset = presetId ? getPreset(presetId) : null

  const editor = (
    <div className="flex h-full flex-col overflow-y-auto bg-sidebar">
      <UseCaseHeader onPick={(input) => guarded(() => load(input))} />
      <StateEditor />
      <QuestionsList />
      {/* Sticky as one block, so Run is always in reach however long the questions get. */}
      <div className="sticky bottom-0 z-10 mt-auto">
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
    <div className="flex h-[calc(100dvh-60px)] flex-col">
      {/* App bar: step 1 is the use-case picker, right where the title would be. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2">
        <h1 className="hidden font-display text-[15px] font-semibold md:block">Playground</h1>
        <span className="hidden h-5 w-px bg-border md:block" aria-hidden />
        <span className="hidden items-center gap-2 font-display text-[14px] font-semibold tracking-[-0.01em] sm:inline-flex"><StepNumber n={1} />Use case</span>
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
          <UseCasePicker onPick={(input) => guarded(() => load(input))} />
          <NextUseCaseButton onPick={(input) => guarded(() => load(input))} />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Popover open={recentOpen} onOpenChange={setRecentOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden />
                <span className="sr-only sm:not-sr-only">Recent</span>
                <ChevronDown className="ml-1 hidden h-3 w-3 text-faint sm:block" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[min(340px,calc(100vw-24px))] rounded-[14px] p-2 shadow-float">
              <p className="px-2.5 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Recent runs</p>
              <RecentPanel
                onPick={(record) => {
                  setRecentOpen(false)
                  guarded(() => restoreRun(record))
                }}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} aria-keyshortcuts="Meta+S Control+S">
            <Share2 className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden />
                <span className="sr-only sm:not-sr-only">Share</span>
            <span className="ml-1.5 hidden font-mono text-[10px] text-faint xl:inline" aria-hidden>
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
              <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden />
                <span className="sr-only sm:not-sr-only">Reset</span>
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
