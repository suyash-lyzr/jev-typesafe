'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'

/**
 * A copy button with a visible, accessible name. The vendored Sage CopyButton
 * is icon-only and cannot take an aria-label, so every copy control built on
 * it was announced as an unnamed button.
 */
export function CopyAction({
  content,
  label,
  variant = 'outline',
  size = 'sm',
  className,
}: {
  content: string | (() => string)
  label: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    const text = typeof content === 'function' ? content() : content
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked: nothing useful to do */
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} className={className}>
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
      {copied ? 'Copied' : label}
      <span className="sr-only" aria-live="polite">
        {copied ? `${label}: copied to the clipboard` : ''}
      </span>
    </Button>
  )
}
