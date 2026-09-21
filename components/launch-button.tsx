'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, type ButtonProps } from '@/components/ui/button'

/** Kept in sync with components/playground/playground.tsx. */
const AUTORUN_KEY = 'jevlab.autorun.once'

/**
 * Opens a preset in the playground and runs it once.
 *
 * The run is authorised by a one-shot token in sessionStorage that only this
 * site's own buttons can set. A URL can never trigger a run — otherwise any
 * link on the internet could spend Lyzr's budget on a visitor's behalf.
 */
export function LaunchButton({
  preset,
  variant,
  mode = 'run',
  children,
  buttonVariant = 'outline',
}: {
  preset: string
  variant?: string
  mode?: 'run' | 'compare'
  children: React.ReactNode
  buttonVariant?: ButtonProps['variant']
}) {
  const router = useRouter()
  const params = new URLSearchParams({ p: preset })
  if (variant) params.set('v', variant)
  if (mode === 'compare') params.set('compare', '1')
  const href = `/play?${params.toString()}`

  return (
    <Button
      variant={buttonVariant}
      size="sm"
      onClick={() => {
        try {
          sessionStorage.setItem(AUTORUN_KEY, `${preset}:${mode}`)
        } catch {
          /* storage blocked: the page still opens, and Run is one click away */
        }
        router.push(href)
      }}
    >
      {children}
    </Button>
  )
}
