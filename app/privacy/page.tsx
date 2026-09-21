import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Jev Lab sends, stores and logs — no accounts, no cookies, no analytics, and never your question text in our logs.',
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

export default function PrivacyPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        There are no accounts and no cookies on this site. This page describes what actually
        happens when you press Run, in the same order the code does it.
      </p>

      <Section title="What leaves your browser">
        <p>
          When you run a request, the state and questions you typed are posted to our server, which
          forwards them to TypeSafe at{' '}
          <span className="font-mono text-xs">api.typesafe.ai/v1/systemone</span> using Lyzr&rsquo;s
          API key. If you switch the comparison on, the same content also goes to OpenAI at{' '}
          <span className="font-mono text-xs">api.openai.com</span>, wrapped in a JSON schema built
          from your questions.
        </p>
        <p>
          So treat this like any public playground:{' '}
          <strong className="text-foreground">
            do not paste anything you would not send to a third-party API
          </strong>
          . No secrets, no customer records, no personal data. What those two companies do with it is
          governed by their terms, not ours. TypeSafe states that it does not train on customer data
          and offers zero retention on enterprise plans; we are not on an enterprise plan, and we
          cannot make that promise on their behalf.
        </p>
      </Section>

      <Section title="What we log">
        <p>
          Our code writes one structured line per call: the model id, the preset slug if you opened
          one, how many questions you asked, the input token count, the latency and the retry count
          (for a comparison, also the LLM&rsquo;s model id, latency and whether it answered). Failed
          calls log the error type and status instead.
        </p>
        <p>
          None of those lines contains your state, your instructions, your criteria or the answers.
          Separately, Vercel — which hosts the site — keeps its own request logs, which include the
          requesting IP address, as any web host does.
        </p>
      </Section>

      <Section title="How we tell callers apart">
        <p>
          Lyzr&rsquo;s key pays for every anonymous run, so the proxy has to rate limit. Your IP
          address is hashed with SHA-256 and a server-side salt, then truncated — we keep 32 hex
          characters of the digest and never the address itself. IPv6 callers are bucketed to their
          /64, because a single host is handed that whole prefix and could otherwise rotate through it.
        </p>
        <p>
          That hash is a counter key in Upstash Redis and nothing else. It is never joined to anything,
          and the windows expire on their own: per-minute and per-day limits roll off with the sliding
          window, and the daily spend counters carry a 48-hour TTL.
        </p>
      </Section>

      <Section title="What stays on your machine">
        <p>
          Your run history, your session cost meter, your lesson progress, the last result of each
          Limits demo you ran, and small settings such as the pane split live in{' '}
          <span className="font-mono text-xs">localStorage</span> in your own browser. We keep at most
          the last 30 runs there, trimmed if they grow past about 1.5 MB, with long states truncated.
          None of it is ever sent to us — clearing your browser storage deletes it permanently, and we
          have no copy.
        </p>
        <p>
          Share links carry the whole request compressed into the URL fragment. Nothing is stored
          server-side to make a share link work, which also means a link you have lost is gone, and a
          link you send to someone contains everything you typed.
        </p>
      </Section>

      <Section title="No cookies, no tracking">
        <p>
          The site sets no cookies and loads no tag manager or third-party script; even the fonts are
          served from this domain. It counts page views with Vercel Web Analytics, which is cookieless
          and served from this domain too — it records which page was viewed, never anything you type.
          The Upstash analytics feature is explicitly disabled.
        </p>
      </Section>

      <Section title="Contact and removal">
        <p>
          Because we hold no account and store nothing keyed to you, there is generally nothing for us
          to delete on request. If you believe you sent us something sensitive, the fastest remedy is
          to clear your browser storage and stop using any share link you generated; then reach us
          through{' '}
          <a className="text-brand hover:underline" href={SITE.links.lyzr}>
            Lyzr&rsquo;s site
          </a>{' '}
          so we can check our logs for the corresponding line — though as described above, that line
          does not contain your content.
        </p>
        <p>
          For anything concerning data held by TypeSafe or OpenAI, those requests have to go to them
          directly.
        </p>
      </Section>

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
