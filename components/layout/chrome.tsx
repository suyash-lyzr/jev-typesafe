'use client'

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
  { href: '/presets', label: 'Presets' },
  { href: '/limits', label: 'Limits' },
  { href: '/compare', label: 'Compare' },
  { href: '/cheatsheet', label: 'Cheatsheet' },
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
      className="hidden font-mono text-[13px] tabular text-muted-foreground lg:inline"
      title="What Lyzr paid for your runs this session, at TypeSafe's list price. Output tokens are free."
    >
      Session · {session.runs} run{session.runs === 1 ? '' : 's'} · {formatUsd(session.costUsd)}
    </span>
  )
}

export function StatusBanner() {
  const [status, setStatus] = React.useState<{ budget: string; resetsAt: string } | null>(null)
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

  if (!status || dismissed || status.budget === 'ok') return null

  const paused = status.budget === 'paused'

  return (
    <InlineBanner variant={paused ? 'warning' : 'info'} onDismiss={() => setDismissed(true)}>
      {paused ? (
        <span>
          Today&rsquo;s free budget is used up. Lyzr pays for these calls and caps them daily.
          Presets still run from recorded responses, marked <strong>replay</strong>; lessons and
          pages stay readable. Live runs return at 00:00 UTC. Need more now? Get your own key at{' '}
          <a href={SITE.links.console} className="text-brand underline">
            console.typesafe.ai
          </a>{' '}
          — Jev Lab is not affiliated with TypeSafe AI.
        </span>
      ) : (
        <span>
          Today&rsquo;s free budget is getting low. Runs still work; if it runs out, presets replay
          recorded answers until 00:00 UTC.
        </span>
      )}
    </InlineBanner>
  )
}

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tracking-tight">{SITE.name}</span>
          <span className="text-xs text-muted-foreground">{SITE.byline}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-fast hover:bg-accent',
                  // Active nav is ink weight, not teal: teal is reserved for
                  // links, focus and the one selected thing in a view.
                  active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SessionCostMeter />
          {pathname !== '/play' && (
            <Button asChild size="sm">
              <Link href="/play">Open playground</Link>
            </Button>
          )}
        </div>
      </div>
      <StatusBanner />
    </header>
  )
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-[1600px] space-y-2 px-4 py-8 text-xs text-muted-foreground">
        <p>
          Built by Lyzr &middot; {SITE.disclaimer}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <a className="text-brand hover:underline" href={SITE.links.docs}>
            docs.typesafe.ai ↗
          </a>
          <a className="text-brand hover:underline" href={SITE.links.console}>
            console.typesafe.ai ↗
          </a>
          <a className="text-brand hover:underline" href={SITE.links.pythonSdk}>
            Python SDK ↗
          </a>
          <a className="text-brand hover:underline" href={SITE.links.jsSdk}>
            JS SDK ↗
          </a>
          <Link className="text-brand hover:underline" href="/about">
            About
          </Link>
          <Link className="text-brand hover:underline" href="/privacy">
            Privacy
          </Link>
        </p>
        <p>{SITE.provenance}</p>
      </div>
    </footer>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-[1100px] px-4 py-10">{children}</main>
      <Footer />
    </>
  )
}
