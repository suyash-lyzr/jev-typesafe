import type { Metadata } from 'next'
import Link from 'next/link'
import { Cookie as CookieIcon, EyeOff, Fingerprint, HardDrive, ScrollText, UserX } from 'lucide-react'
import { PageShell } from '@/components/layout/chrome'
import { DataFlow } from '@/components/visuals/visuals'
import { IconCard } from '@/components/visuals/icon-card'
import { pastel } from '@/components/visuals/pastel'
import { cn } from '@/lib/utils'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Jev Lab sends, stores and logs — no accounts, no cookies, no analytics, and never your question text in our logs.',
}

export default function PrivacyPage() {
  return (
    <PageShell>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Privacy</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        There are no accounts and no cookies on this site. This page describes what actually
        happens when you press Run, in the same order the code does it.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { Icon: UserX, t: 'No accounts' },
          { Icon: CookieIcon, t: 'No cookies' },
          { Icon: EyeOff, t: 'Your text is never logged' },
          { Icon: HardDrive, t: 'History stays in your browser' },
        ].map(({ Icon, t }, i) => (
          <div key={t} className={cn('flex items-center gap-3 rounded-[16px] border px-4 py-3.5 shadow-card', pastel(i))}>
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-[13.5px] font-medium">{t}</span>
          </div>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="leaves-heading">
        <h2 id="leaves-heading" className="text-xl font-semibold">What leaves your browser</h2>
        <DataFlow
          className="mt-4"
          nodes={[
            { title: 'Your browser', sub: 'State + questions you typed', icon: 'monitor' },
            { title: 'Lyzr server', sub: 'Adds Lyzr’s key · logs no content', icon: 'shield', tone: 'ink' },
            [
            { title: 'TypeSafe', sub: 'api.typesafe.ai/v1/systemone', icon: 'cpu' },
            { title: 'OpenAI', sub: 'Only if Compare is on', icon: 'sparkles', tone: 'muted' },
          ],
          ]}
        />
        <p className="mt-4 rounded-[12px] border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] leading-relaxed text-warning-text">
          Treat it like any public playground: don&rsquo;t paste anything you wouldn&rsquo;t send to a third-party API. What TypeSafe
          and OpenAI do with it is governed by their terms. TypeSafe says it doesn&rsquo;t train on customer data; its zero retention
          is for enterprise plans, which we aren&rsquo;t on.
        </p>
      </section>

      <div className="mt-10 grid gap-3 md:grid-cols-2">
        <IconCard Icon={ScrollText} title="What we log">
          One line per call: model id, preset, question count, input tokens, latency, retries (and the LLM&rsquo;s id and latency when
          comparing). Never your state, instructions, criteria or answers. Vercel keeps its own request logs, with IP addresses, as
          any host does.
        </IconCard>
        <IconCard Icon={Fingerprint} title="How we tell callers apart">
          Your IP is hashed (SHA-256 with a server salt) and truncated to 32 hex characters; IPv6 is bucketed to its /64. The hash is
          only a rate-limit counter in Upstash Redis, and it expires — per-day windows roll off, spend counters last 48 hours.
        </IconCard>
        <IconCard Icon={HardDrive} title="What stays on your machine">
          Run history (last 30, about 1.5 MB max), cost meter, lesson progress, Limits results and settings live in{' '}
          <span className="font-mono text-xs">localStorage</span>. None of it is sent to us; clearing storage deletes it. Share links
          carry the whole request in the URL fragment — nothing is stored server-side.
        </IconCard>
        <IconCard Icon={CookieIcon} title="No cookies, no tracking">
          No cookies, no tag manager, no third-party scripts; fonts are served from this domain. Page views are counted with
          cookieless Vercel Web Analytics — never anything you type. Upstash analytics is off.
        </IconCard>
      </div>

      <section className="mt-10 rounded-[16px] border border-dashed border-border px-5 py-4" aria-label="Contact and removal">
        <h2 className="text-[15px] font-semibold">Contact and removal</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          We hold no account and nothing keyed to you, so there&rsquo;s usually nothing to delete. If you sent something sensitive,
          clear your browser storage, stop using any share link, and reach us through{' '}
          <a className="text-brand hover:underline" href={SITE.links.lyzr}>
            Lyzr&rsquo;s site
          </a>
          . Data held by TypeSafe or OpenAI has to be requested from them.
        </p>
      </section>

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">
        {SITE.disclaimer} Read more about how the site is built and paid for on the{' '}
        <Link className="text-brand hover:underline" href="/about">
          about page
        </Link>
        .
      </p>
    </PageShell>
  )
}
