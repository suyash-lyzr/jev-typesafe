'use client'

import * as React from 'react'
import { InlineBanner } from '@/components/ui/inline-banner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CopyAction } from './copy-action'
import { usePlayground } from '@/lib/store'
import { encodeShare, shareSize, shareUrl, urlBytes } from '@/lib/share'

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, stateMode, model, questions, variants, policy, compareOn, title } = usePlayground()

  const url = React.useMemo(() => {
    if (!open || typeof window === 'undefined') return ''
    const encoded = encodeShare({ state, stateMode, model, questions, variants, policy, compare: compareOn, title })
    return shareUrl(window.location.origin, encoded)
  }, [open, state, stateMode, model, questions, variants, policy, compareOn, title])

  const size = url ? shareSize(url) : 'ok'
  const count = Object.keys(questions).length
  // The same content as the link, for when the link is too long to travel.
  const json = JSON.stringify({ title, state, model, questions, variants, policy }, null, 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share this request</DialogTitle>
          <DialogDescription>
            Includes the state, {count} question{count === 1 ? '' : 's'}
            {Object.keys(variants).length > 0 ? ', their A/B variants' : ''}, the policy thresholds
            and the compare setting. It does not include any answers.
          </DialogDescription>
        </DialogHeader>

        {size !== 'too-long' ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-2 font-mono text-xs"
            />
            <CopyAction label="Copy link" content={url} />
          </div>
        ) : (
          <InlineBanner variant="warning">
            This request is too long for a link ({urlBytes(url).toLocaleString()} bytes). Copy the JSON
            instead.
          </InlineBanner>
        )}

        {size === 'long' && (
          <InlineBanner variant="info">
            {urlBytes(url).toLocaleString()} bytes — some chat apps truncate links this long. If it
            arrives broken, send the JSON instead.
          </InlineBanner>
        )}

        <div>
          <CopyAction label="Copy as JSON" variant="ghost" content={json} />
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
