import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TopNav } from '@/components/layout/chrome'
import { Playground } from '@/components/playground/playground'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = {
  title: 'Playground',
  description:
    'Send a state and typed questions to Jev, read the probabilities, and turn them into policy without another API call.',
}

export default function PlayPage() {
  return (
    <>
      <TopNav />
      <Suspense
        fallback={
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <Skeleton className="h-[70vh] w-full" />
            <Skeleton className="h-[70vh] w-full" />
          </div>
        }
      >
        <Playground />
      </Suspense>
    </>
  )
}
