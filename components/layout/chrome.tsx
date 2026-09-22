'use client'

import { LyzrLogo } from './lyzr-logo'
import { ThemeToggle } from './theme-toggle'
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { InlineBanner } from '@/components/ui/inline-banner'
import { SITE } from '@/lib/site'
import { formatUsd } from '@/lib/pricing'
import { loadSession, type SessionTotals } from '@/lib/storage'

const NAV = [
  { href: '/play', label: 'Play' },
  { href: '/learn', label: 'Learn' },
  { href: '/presets', label: 'Examples' },
  { href: '/limits', label: 'Limits' },
  { href: '/compare', label: 'Compare' },
]

/**
 * Everything derived from localStorage renders only after mount. Rendering it
 * on the server would flash "0 runs" and then correct itself, and React would
 * warn about the mismatch.
 */
function SessionCostMeter() {
  const [session, setSession] = React.useState<SessionTotals | null>(null)

  React.useEffect(() => {
    setSession(loadSession())
    const onStorage = () => setSession(loadSession())
    window.addEventListener('storage', onStorage)
    const poll = setInterval(() => setSession(loadSession()), 2000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(poll)
    }
  }, [])

  if (!session || session.runs === 0) return null

  return (
    <span
      className="hidden font-mono text-xs tabular text-faint lg:inline"
      title="What Lyzr paid for your runs this session, at TypeSafe's list price. Output tokens are free."
    >
      {session.runs} run{session.runs === 1 ? '' : 's'} · {formatUsd(session.costUsd)}
    </span>
  )
}

export function StatusBanner() {
  const [status, setStatus] = React.useState<{ budget: string; compareBudget?: string } | null>(null)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/status')
      .then((r) => r.json())
      .then((s) => !cancelled && setStatus(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!status || dismissed) return null

  const paused = status.budget === 'paused'
  const low = status.budget === 'low'
  const compareOnly = status.budget === 'ok' && status.compareBudget === 'paused'
  if (!paused && !low && !compareOnly) return null

  return (
    <InlineBanner variant={paused ? 'warning' : 'info'} onDismiss={() => setDismissed(true)}>
      {paused ? (
        <span>
          Live runs are paused until 00:00 UTC. Unedited presets still show their recorded answers.{' '}
          <a href={SITE.links.console} className="text-brand underline">
            Get your own key ↗
          </a>
        </span>
      ) : compareOnly ? (
        <span>Comparisons are paused until 00:00 UTC. Jev runs still work.</span>
      ) : (
        <span>Today&rsquo;s free budget is running low.</span>
      )}
    </InlineBanner>
  )
}

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div
        className={cn(
          'mx-auto flex h-[60px] items-center gap-7 px-4',
          // The playground is a full-width tool; everything else sits on the 1240 grid.
          pathname === '/play' ? 'max-w-none' : 'max-w-[1240px] sm:px-8'
        )}
      >
        <div className="flex shrink-0 items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2" aria-label={`${SITE.name} home`}>
            <LyzrLogo variant="mark" className="h-6" alt="" />
            <span className="font-display text-base font-semibold tracking-tight">{SITE.name}</span>
          </Link>
          <a
            href={SITE.links.lyzr}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-xs font-medium text-faint transition-opacity hover:opacity-80 sm:flex"
            aria-label="By Lyzr (opens lyzr.ai)"
          >
            by
            <LyzrLogo variant="text" className="h-[13px] translate-y-[1.5px] opacity-80" alt="Lyzr" />
          </a>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto py-1 pr-1 sm:gap-1.5" aria-label="Main">
          {NAV.map((item, i) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors duration-fast',
                  i > 1 && 'hidden md:inline-flex',
                  active
                    ? 'shadow-card border bg-card font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <SessionCostMeter />
          <ThemeToggle />
          {pathname !== '/play' && (
            <Button asChild size="sm" className="h-9 rounded-[10px] px-4">
              <Link href="/play">Open playground</Link>
            </Button>
          )}
        </div>
      </div>
      <StatusBanner />
    </header>
  )
}

export function Footer({ disclaimer = true }: { disclaimer?: boolean } = {}) {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8">
        <p>
          <a href={SITE.links.lyzr} target="_blank" rel="noreferrer" className="mr-1.5 inline-flex items-center gap-1.5 align-middle hover:opacity-80">
            Built by <LyzrLogo variant="text" className="h-3 translate-y-[1px]" alt="Lyzr" />
          </a>
          {disclaimer && <>· {SITE.disclaimer}</>}
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto" aria-label="Footer">
          <Link className="hover:text-foreground" href="/cheatsheet">Cheatsheet</Link>
          <Link className="hover:text-foreground" href="/about">About</Link>
          <Link className="hover:text-foreground" href="/privacy">Privacy</Link>
          <a className="hover:text-foreground" href={SITE.links.docs}>Docs ↗</a>
          <a className="hover:text-foreground" href={SITE.links.console}>Console ↗</a>
        </nav>
      </div>
    </footer>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main id="main" className="mx-auto max-w-[1240px] px-4 py-12 sm:px-8">{children}</main>
      <Footer />
    </>
  )
}
