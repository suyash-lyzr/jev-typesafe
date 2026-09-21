import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { AnswerView } from '@/components/playground/answer-views'
import { SITE } from '@/lib/site'
import { allPresets } from '@/content/presets'
import type { Preset, PresetVariant } from '@/content/presets'

const limitsPresets = allPresets.filter((p) => p.category === 'limits')

export const metadata: Metadata = {
  title: 'Limits',
  description:
    'Five documented failure modes of jev-1.13, each running live next to the rewrite that works.',
}

/** `works` variants are the fix; everything else on this page is a failure. */
function isFix(variant: PresetVariant): boolean {
  return variant.id === 'works'
}

function VariantCard({ preset, variant }: { preset: Preset; variant: PresetVariant }) {
  const fix = isFix(variant)
  const questions = variant.questions ?? preset.questions
  const count = Object.keys(questions).length
  const recorded = variant.recorded

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant={fix ? 'success' : 'danger'}>{fix ? 'Works' : 'Breaks'}</Chip>
        <h3 className="text-[15px] font-semibold">{variant.label}</h3>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{variant.description}</p>

      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        {`${count} question${count === 1 ? '' : 's'} · `}
        {[...new Set(Object.values(questions).map((q) => q.type))].join(' + ')}
      </p>

      {recorded ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {Object.entries(recorded.answers).map(([id, answer]) => (
            <div key={id}>
              <p className="font-mono text-[11px] text-muted-foreground">{id}</p>
              <div className="mt-1.5">
                <AnswerView answer={answer} showGuide={false} />
              </div>
            </div>
          ))}

          {recorded.note && (
            <p className="text-xs leading-relaxed text-muted-foreground">{recorded.note}</p>
          )}

          <p className="font-mono text-[11px] text-muted-foreground">
            Replay · {recorded.model} · recorded {recorded.date} from {recorded.source}
          </p>
        </div>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          We have not recorded this one. Run it and you get a live answer — which is the point: the
          failure is reproducible, but the exact number is not, and quoting one we captured once
          would suggest otherwise.
        </p>
      )}

      <Button variant={fix ? 'default' : 'outline'} size="sm" className="mt-4" asChild>
        <Link href={`/play?p=${preset.slug}&v=${variant.id}`}>
          {recorded ? 'Open and run it yourself' : 'Run it in the playground'}
        </Link>
      </Button>
    </div>
  )
}

export default function LimitsPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Where Jev breaks</h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        TypeSafe publishes its own list of things jev-1.13 gets wrong. Five of them run here, each
        one paired with the rewrite that works — because the fix is never to ask more nicely. It is
        always a different shape of question, with the arithmetic and the identities moved into your
        code, where they belong.
      </p>

      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        None of these are gotchas we went hunting for. A playground that only ran the cases
        flattering the model would teach you to trust it in exactly the places you should not.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={SITE.links.jaggedness}>TypeSafe&rsquo;s jagged edges page ↗</a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/cheatsheet">All nine failure modes →</Link>
        </Button>
      </div>

      {limitsPresets.map((preset, i) => (
        <section key={preset.slug} className="mt-14 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xl font-semibold">
              <span className="mr-2 font-mono text-sm text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
              {preset.title}
            </h2>
            {preset.patterns.map((pattern) => (
              <Chip key={pattern} variant="outline">
                {pattern}
              </Chip>
            ))}
          </div>

          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            {preset.teaches}
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {preset.variants.map((variant) => (
              <VariantCard key={variant.id} preset={preset} variant={variant} />
            ))}
          </div>

          {!preset.variants.some(isFix) && (
            <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
              There is no <strong className="text-foreground">Works</strong> card here. No rewording
              makes two phrasings of one question agree, and no arithmetic relates two separate
              answers. The fix is to pick one phrasing and threshold it — which is a decision you
              make, not a question you ask.
            </p>
          )}
        </section>
      ))}

      <section className="mt-14 border-t border-border pt-8">
        <h2 className="text-xl font-semibold">What to take from this</h2>
        <ul className="mt-3 max-w-[70ch] space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">Count, add and compare in code.</strong> Ask one
            question per item and reduce the answers yourself. All the questions still fit in one
            request, so the honest version costs the same as the broken one.
          </li>
          <li>
            <strong className="text-foreground">Describe situations, not degrees.</strong> Each Score
            level is matched against the state on its own — it never sees its own number or its
            neighbours, so <span className="font-mono text-xs">&ldquo;1&rdquo;</span> gives it
            nothing to match.
          </li>
          <li>
            <strong className="text-foreground">Give ambiguity somewhere to go.</strong> An{' '}
            <span className="font-mono text-xs">ambiguous</span> or{' '}
            <span className="font-mono text-xs">none</span> option lets the model decline instead of
            guessing, and lets your code refuse instead of proceeding.
          </li>
          <li>
            <strong className="text-foreground">Expect no identities between answers.</strong>{' '}
            P(yes) + P(not yes) came to 1.19 in TypeSafe&rsquo;s own example. Ask the question you
            actually need and threshold that one.
          </li>
          <li>
            <strong className="text-foreground">Treat the state as data you are judging.</strong> Say
            so in the criteria, and add a Noul asking whether the text is talking to the classifier.
            That gives your code something to route on.
          </li>
        </ul>
      </section>

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">
        {SITE.provenance} Recorded numbers on this page carry the page, model id and date they came
        from. {SITE.disclaimer}
      </p>
    </PageShell>
  )
}
