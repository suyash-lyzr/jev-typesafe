import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TopNav, Footer } from '@/components/layout/chrome'
import { FirstRunCard } from '@/components/landing/first-run-card'
import { SITE } from '@/lib/site'
import { pastel } from '@/components/visuals/pastel'
import { cn } from '@/lib/utils'
import { PRICING } from '@/lib/pricing'

const FACTS = [
  { value: '70–500 ms', label: 'end to end', href: SITE.links.launchPost, title: 'Per TypeSafe’s launch post' },
  { value: `$${PRICING.jev.inPerM}`, label: 'per 1M input tokens', href: null, title: 'Output tokens are free' },
  { value: '3', label: 'question types', href: null, title: 'Choice, Score, Noul' },
]

const TILES = [
  { href: '/presets', title: 'All examples', body: 'Thirty-eight real use cases, ready to edit and run.' },
  { href: '/learn', title: 'Learn Jev', body: 'Six short lessons, about half an hour, each with a live checkpoint.' },
  { href: '/compare', title: 'Jev vs an LLM', body: 'Same request, both models, measured.' },
]

export default function Home() {
  return (
    <>
      <TopNav />

      <main id="main" className="mx-auto max-w-[1240px] px-4 sm:px-8">
        <section className="grid items-center gap-10 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14 lg:pb-20 lg:pt-12">
          <div>
            <span className="inline-flex h-7 items-center gap-2 rounded-full border border-border bg-card px-3 text-[12.5px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Free · no account · Jev by TypeSafe AI
            </span>

            <h1 className="mt-6 text-[42px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[54px]">
              Jev doesn&rsquo;t write.
              <br />
              <span className="text-faint">It decides.</span>
            </h1>

            <p className="mt-5 max-w-[30em] text-[17px] leading-relaxed text-muted-foreground">
              Send text and typed questions. Get probabilities your code can branch on, in about a
              tenth of a second.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <Button asChild className="h-[38px] rounded-[10px] px-4">
                <Link href="/play">Open playground</Link>
              </Button>
              <Button variant="outline" asChild className="h-[38px] rounded-[10px] bg-card px-4">
                <Link href="/learn">Take the lessons</Link>
              </Button>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-dashed border-border pt-5 sm:flex sm:gap-x-8">
              {FACTS.map((fact) => (
                <div key={fact.label} title={fact.title}>
                  <dt className="num text-lg font-semibold sm:text-[22px]">
                    {fact.href ? (
                      <a href={fact.href} className="hover:text-brand" target="_blank" rel="noreferrer">
                        {fact.value}
                      </a>
                    ) : (
                      fact.value
                    )}
                  </dt>
                  <dd className="text-[12.5px] text-muted-foreground">{fact.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <FirstRunCard />
        </section>

        <section className="grid gap-3 pb-8 sm:grid-cols-3" aria-label="Explore">
          {TILES.map((tile, i) => (
            <Link key={tile.href} href={tile.href} className={cn('group rounded-[16px] border p-5 shadow-card', pastel(i))}>
              <span className="flex items-center justify-between font-display text-[15px] font-semibold">
                {tile.title}
                <ArrowUpRight
                  className="h-4 w-4 text-faint transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              </span>
              <span className="mt-1 block text-[13.5px] text-muted-foreground">{tile.body}</span>
            </Link>
          ))}
        </section>
      </main>

      <Footer />
    </>
  )
}
