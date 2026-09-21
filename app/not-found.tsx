import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <PageShell>
      <div className="flex min-h-[50vh] flex-col items-start justify-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nothing here</h1>
        <p className="mt-3 max-w-[52ch] text-base text-muted-foreground">
          That page does not exist — or a link pointed somewhere that has since moved. The
          playground is a good place to start again.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/play">Open the playground</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/learn">Learn Jev</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
