'use client'

import * as React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { applyTheme, readThemePref, type ThemePref } from '@/lib/theme'

const OPTIONS: Array<{ value: ThemePref; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/** A three-way switch: light, system, dark. Renders neutral until mounted. */
export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = React.useState<ThemePref | null>(null)

  React.useEffect(() => {
    setPref(readThemePref())
    // Following the system means following it live, too.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => readThemePref() === 'system' && applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn('inline-flex items-center gap-0.5 rounded-full border border-border bg-card/60 p-0.5', className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = pref === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => {
              setPref(value)
              applyTheme(value)
            }}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-fast',
              active ? 'bg-foreground text-background' : 'text-faint hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
