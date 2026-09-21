import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { Chip } from '@/components/ui/chip'
import { allPresets, CATEGORY_LABEL, type PresetCategory } from '@/content/presets'

export const metadata: Metadata = {
  title: 'Presets',
  description: 'Real Jev requests, editable and shareable. Each one teaches one thing.',
}

const ORDER: PresetCategory[] = ['support', 'guardrails', 'scoring', 'extraction', 'limits']

export default function PresetsPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Presets</h1>
      <p className="mt-2 max-w-[60ch] text-base text-muted-foreground">
        Real requests, editable and shareable. Each one teaches one thing, and each opens in the
        playground where you can change anything and run it.
      </p>

      {ORDER.map((category) => {
        const presets = allPresets.filter((p) => p.category === category)
        if (presets.length === 0) return null

        return (
          <section key={category} className="mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {CATEGORY_LABEL[category]}
            </h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {presets.map((preset) => {
                const types = new Set(Object.values(preset.questions).map((q) => q.type))
                const recordedCount = preset.variants.filter((v) => v.recorded).length

                return (
                  <Link
                    key={preset.slug}
                    href={`/play?p=${preset.slug}`}
                    className="rounded-lg border border-border bg-card p-4 transition-colors duration-fast hover:bg-accent"
                  >
                    <h3 className="text-[13px] font-medium">{preset.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {preset.teaches}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {[...types].map((t) => (
                        <Chip key={t} variant="outline">
                          {t.toUpperCase()}
                        </Chip>
                      ))}
                      {preset.variants.length > 1 && (
                        <Chip variant="default">{preset.variants.length} variants</Chip>
                      )}
                    </div>

                    {preset.patterns.length > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {preset.patterns.join(' · ')}
                      </p>
                    )}
                    {recordedCount > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {recordedCount} variant{recordedCount === 1 ? '' : 's'} replay a recorded
                        answer
                      </p>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">
        Recorded numbers in these presets come from docs.typesafe.ai, with the page, model id and
        date shown on each one. Several were recorded on jev-1.12 from small demo sets — eight
        citations, fifteen messages, sixty filings. They show the shape of a result, not a
        benchmark, and a live run can differ.
      </p>
    </PageShell>
  )
}
