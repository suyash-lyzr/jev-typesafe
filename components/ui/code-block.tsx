"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * CodeBlock — a monospaced code surface with an optional filename header and
 * copy affordance. Neutral chrome; the copy "done" tick is the one teal moment.
 */
const CodeBlock = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    code: string
    filename?: string
    language?: string
  }
>(({ className, code, filename, language, ...props }, ref) => {
  const [copied, setCopied] = React.useState(false)

  const onCopy = React.useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
      {...props}
    >
      {(filename || language) && (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {filename ?? language}
          </span>
        </div>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy code"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-brand" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <pre className="overflow-x-auto p-4 text-sm">
          <code className="font-mono text-foreground">{code}</code>
        </pre>
      </div>
    </div>
  )
})
CodeBlock.displayName = "CodeBlock"

export { CodeBlock }
