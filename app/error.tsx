'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * The last line of defence for a render error. Calm, actionable, and it never
 * shows the error's own text — that can contain whatever the reader pasted.
 */
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-[1100px] flex-col items-start justify-center px-4">
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Something broke on this page</h1>
      <p className="mt-3 max-w-[52ch] text-base text-muted-foreground">
        It is a problem with the page, not with anything you did. Try again; if it keeps happening,
        reloading the playground clears whatever state caused it.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/play">Reload the playground</Link>
        </Button>
      </div>
    </main>
  )
}
