'use client'

import * as React from 'react'
import { usePlayground } from '@/lib/store'

/**
 * "⌘" on Apple platforms, "Ctrl" elsewhere. Starts as ⌘ on the server and
 * settles after mount, so the markup never mismatches during hydration.
 */
export function useModKey(): string {
  const [mod, setMod] = React.useState('⌘')
  React.useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform
    setMod(/mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl ')
  }, [])
  return mod
}

export function isModEvent(e: KeyboardEvent): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad|ipod/i.test(platform) ? e.metaKey : e.ctrlKey
}

/**
 * mod+Enter runs the current request — the shortcut the Run button advertises.
 * It does nothing while a dialog is open, so it can never fire a run hidden
 * behind a modal.
 */
export function useRunShortcut(): void {
  const run = usePlayground((s) => s.run)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !isModEvent(e)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])
}

/**
 * mod+S opens Share, as the Share button advertises. It replaces the browser's
 * "save page" only on /play, and stays out of the way while a dialog is open.
 */
export function useShareShortcut(open: () => void): void {
  const openRef = React.useRef(open)
  openRef.current = open
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 's' || !isModEvent(e) || e.shiftKey || e.altKey) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      openRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
