import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'
import { SITE } from '@/lib/site'
import { PRICING } from '@/lib/pricing'
import { LIMITS } from '@/lib/guards'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Who built Jev Lab, who pays for the runs, where every number comes from, and what this site is not.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-border pt-7">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 max-w-[68ch] space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export default function AboutPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">About {SITE.name}</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        {SITE.description}
      </p>

      <Section title="Why it exists">
        <p>
          Jev is unusual enough that reading about it does not really land. A model that never writes a
          sentence, that answers only in probability distributions, and whose whole value is that your
          code stays in charge — that is easier to understand after one run than after a page of
          documentation.
        </p>
        <p>
          So this is a playground first and a course second. Every claim on the site has a request
          behind it that you can open, change and send.
        </p>
      </Section>

      <Section title="Who pays for the runs">
        <p>
          Lyzr does. There is no sign-up and no key to paste: runs go through our server on our
          TypeSafe key, which is why the proxy is wrapped in rate limits and a daily dollar cap. The
          defaults are {LIMITS.play.perMinute} runs a minute and {LIMITS.play.perDay} a day per
          network, with the live LLM comparison held much tighter at {LIMITS.compare.perMinute} a
          minute and {LIMITS.compare.perDay} a day because it is the expensive half.
        </p>
        <p>
          When the day&rsquo;s budget runs out, the site does not break. Presets fall back to answers
          we recorded earlier, always labelled as replays, and everything readable stays readable. Live
          runs return at 00:00 UTC. If you want to work without any of that, get your own key at{' '}
          <a className="text-brand hover:underline" href={SITE.links.console}>
            console.typesafe.ai
          </a>{' '}
          — at ${PRICING.jev.inPerM} per million input tokens with output free, a session like this one
          costs a fraction of a cent.
        </p>
      </Section>

      <Section title="How we handle numbers">
        <p>
          Every figure on this site is one of two things, and it is always marked which. A{' '}
          <strong className="text-foreground">live</strong> number is a single run from our server,
          network included, from {SITE.region}. A <strong className="text-foreground">replay</strong> is
          a response we recorded, shown with the docs page it came from, the versioned model id that
          produced it, and the date.
        </p>
        <p>
          Neither kind is a benchmark. Nothing here is graded against a right answer, several recorded
          runs came from small demo sets in TypeSafe&rsquo;s cookbooks — eight citations, fifteen
          messages, sixty filings — and some were recorded on jev-1.12 rather than the current model.
          They show the shape of a result. Where we quote TypeSafe&rsquo;s own performance claims, we
          say they are TypeSafe&rsquo;s and repeat their conditions.
        </p>
        <p>
          We also print the versioned model id from each response rather than the alias we asked for,
          because <span className="font-mono text-xs">jev-latest</span> moves and a number is worthless
          without knowing what produced it.
        </p>
      </Section>

      <Section title="What this site is not">
        <p>
          It is not affiliated with TypeSafe AI, not endorsed by them, and not a substitute for{' '}
          <a className="text-brand hover:underline" href={SITE.links.docs}>
            their documentation
          </a>
          , which is the authority on everything here. &ldquo;Jev&rdquo; and
          &ldquo;TypeSafe&rdquo; are their names. Where our reading of the docs differs from the docs,
          the docs are right.
        </p>
        <p>
          It is also not a place to put real data. See the{' '}
          <Link className="text-brand hover:underline" href="/privacy">
            privacy page
          </Link>{' '}
          for exactly what is sent, logged and stored.
        </p>
      </Section>

      <Section title="How it is built">
        <p>
          Next.js on Vercel. The TypeSafe contract is mirrored once as a Zod schema that both the
          browser editor and the server proxy import, so a request that validates in the form validates
          at the edge of the network too. Rate limiting and the spend cap run on Upstash Redis, and
          spend is reserved before each call and reconciled after, so concurrent requests cannot
          overshoot the cap.
        </p>
        <p>
          The error fixtures under <span className="font-mono text-xs">content/recorded/errors</span>{' '}
          are real API rejections we captured on purpose — a Score with 11 levels, a Choice with 256
          options, a missing state — which is how the linter knows which limits TypeSafe actually
          enforces and which are only advice.
        </p>
      </Section>

      <section className="mt-10 rounded-lg border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Start somewhere</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/play">Open the playground</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/learn">Learn it in 5 minutes</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/limits">Where it breaks</Link>
          </Button>
        </div>
      </section>

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">{SITE.provenance}</p>
    </PageShell>
  )
}
