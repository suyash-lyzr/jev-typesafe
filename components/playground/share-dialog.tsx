'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { InlineBanner } from '@/components/ui/inline-banner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePlayground } from '@/lib/store'
import { encodeShare, shareSize, shareUrl, urlBytes } from '@/lib/share'

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, stateMode, model, questions, variants, policy, compareOn, title } = usePlayground()

  const url = React.useMemo(() => {
    if (!open || typeof window === 'undefined') return ''
    const encoded = encodeShare({
      state,
      stateMode,
      model,
      questions,
      variants,
      policy,
      compare: compareOn,
      title,
    })
    return shareUrl(window.location.origin, encoded)
  }, [open, state, stateMode, model, questions, variants, policy, compareOn, title])

  const size = url ? shareSize(url) : 'ok'
  const json = JSON.stringify({ state, model, questions }, null, 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share this request</DialogTitle>
          <DialogDescription>
            Includes the state, {Object.keys(questions).length} question
            {Object.keys(questions).length === 1 ? '' : 's'}, the policy thresholds and the compare
            setting. It does not include the answers.
          </DialogDescription>
        </DialogHeader>

        {size !== 'too-long' ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 flex-1 rounded-md border border-input bg-muted/40 px-2 font-mono text-xs"
            />
            <CopyButton content={url} variant="outline" />
          </div>
        ) : (
          <InlineBanner variant="warning">
            This request is too long for a link ({urlBytes(url).toLocaleString()} bytes). Copy the
            JSON instead.
          </InlineBanner>
        )}

        {size === 'long' && (
          <InlineBanner variant="info">
            {urlBytes(url).toLocaleString()} bytes — some chat apps truncate links this long. If it
            arrives broken, send the JSON instead.
          </InlineBanner>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <span className="inline-flex items-center gap-2">
              Copy the JSON <CopyButton content={json} />
            </span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          The link carries your state and questions in the URL fragment, which browsers do not send
          to servers. Share it as carefully as the text inside it. Nothing runs until whoever opens
          it presses Run.
        </p>
      </DialogContent>
    </Dialog>
  )
}
