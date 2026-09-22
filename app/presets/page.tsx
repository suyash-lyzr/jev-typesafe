import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/chrome'
import { TypeBadge } from '@/components/playground/type-badge'
import { CategoryIcon } from '@/components/playground/use-case-picker'
import {
  allPresets,
  CATEGORY_LABEL,
  DECISION_SHAPES,
  USE_CASE_GROUP_BLURB,
  USE_CASE_GROUP_LABEL,
  USE_CASE_GROUPS,
  type Preset,
  type PresetCategory,
} from '@/content/presets'

export const metadata: Metadata = {
  title: 'Examples',
  description:
    'Thirty-eight Jev use cases grouped by TypeSafe’s use-case map, plus the docs’ own requests — each with a real recorded answer.',
}

const USE_CASE_MAP = 'https://docs.typesafe.ai/concepts/use-case-map'
const DOC_CATEGORIES: PresetCategory[] = ['support', 'guardrails', 'scoring', 'extraction', 'limits']

function types(preset: Preset) {
  return [...new Set(Object.values(preset.questions).map((q) => q.type))]
}

function UseCaseCard({ preset }: { preset: Preset }) {
  const shape = DECISION_SHAPES.find((s) => s.id === preset.shape)?.label
  return (
    <Link
      href={`/play?p=${preset.slug}`}
      className="group flex flex-col rounded-[16px] border border-border bg-card p-4 shadow-card transition-[border-color,box-shadow] duration-fast hover:border-brand/40 hover:shadow-float"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold group-hover:text-brand-text">{preset.title}</h3>
        <div className="flex shrink-0 gap-1">
          {types(preset).map((t) => (
            <TypeBadge key={t} type={t} className="h-5 text-[10px]" />
          ))}
        </div>
      </div>
      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground">{preset.teaches}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {preset.industry && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{preset.industry}</span>
        )}
        {shape && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{shape}</span>}
      </div>
    </Link>
  )
}

export default function ExamplesPage() {
  const useCases = allPresets.filter((p) => p.category === 'usecase')

  return (
    <PageShell>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Examples</h1>
      <p className="mt-3 max-w-[60ch] text-[17px] leading-relaxed text-muted-foreground">
        {useCases.length} use cases, grouped the way TypeSafe&rsquo;s{' '}
        <a className="text-brand hover:underline" href={USE_CASE_MAP} target="_blank" rel="noreferrer">
          use-case map ↗
        </a>{' '}
        groups them. Each has a real recorded answer and opens in the playground.
      </p>

      {/* Jump nav */}
      <nav className="mt-7 flex flex-wrap gap-2" aria-label="Categories">
        {USE_CASE_GROUPS.map((g) => (
          <a
            key={g}
            href={`#${g}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-[13px] text-foreground hover:border-faint"
          >
            <CategoryIcon group={g} className="h-6 w-6 rounded-full [&_svg]:h-3 [&_svg]:w-3" />
            {USE_CASE_GROUP_LABEL[g]}
            <span className="font-mono text-[11px] text-faint">{useCases.filter((p) => p.group === g).length}</span>
          </a>
        ))}
        <a href="#shapes" className="inline-flex items-center rounded-full border border-dashed border-border px-3 text-[13px] text-muted-foreground hover:text-foreground">
          Decision shapes
        </a>
        <a href="#docs" className="inline-flex items-center rounded-full border border-dashed border-border px-3 text-[13px] text-muted-foreground hover:text-foreground">
          From the docs
        </a>
      </nav>

      {USE_CASE_GROUPS.map((g) => {
        const items = useCases.filter((p) => p.group === g)
        return (
          <section key={g} id={g} className="mt-12 scroll-mt-24">
            <div className="flex items-start gap-3">
              <CategoryIcon group={g} className="h-10 w-10 rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]" />
              <div>
                <h2 className="text-xl font-semibold">{USE_CASE_GROUP_LABEL[g]}</h2>
                <p className="mt-0.5 text-[13.5px] text-muted-foreground">{USE_CASE_GROUP_BLURB[g]}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((preset) => (
                <UseCaseCard key={preset.slug} preset={preset} />
              ))}
            </div>
          </section>
        )
      })}

      {/* Decision shapes, from the same page */}
      <section id="shapes" className="mt-14 scroll-mt-24">
        <h2 className="text-xl font-semibold">Decision shapes</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          The ten shapes TypeSafe names, and which use cases here show each one.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Shape</th>
                <th className="px-4 py-2.5 font-medium">Reach for it when</th>
                <th className="px-4 py-2.5 font-medium">Try it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DECISION_SHAPES.map((shape) => {
                const shown = useCases.filter((p) => p.shape === shape.id)
                return (
                  <tr key={shape.id} className="align-top">
                    <td className="px-4 py-3 font-semibold text-foreground">{shape.label}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {shape.when}
                      <span className="block text-xs text-faint">{shape.examples}</span>
                    </td>
                    <td className="px-4 py-3">
                      {shown.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {shown.map((p) => (
                            <Link
                              key={p.slug}
                              href={`/play?p=${p.slug}`}
                              className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-text hover:underline"
                            >
                              {p.title}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">
                          Not yet — search and retrieval here are shown through ranking and RAG checks.
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* The docs' own requests */}
      <section id="docs" className="mt-14 scroll-mt-24">
        <h2 className="text-xl font-semibold">From the TypeSafe docs</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          The requests the documentation uses, with the numbers it prints. The lessons and the Limits page are built on these.
        </p>
        {DOC_CATEGORIES.map((c) => {
          const presets = allPresets.filter((p) => p.category === c)
          if (presets.length === 0) return null
          return (
            <div key={c} className="mt-6">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{CATEGORY_LABEL[c]}</h3>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {presets.map((preset) => (
                  <Link
                    key={preset.slug}
                    href={`/play?p=${preset.slug}`}
                    className="flex flex-col rounded-[14px] border border-border bg-card p-4 transition-colors duration-fast hover:border-faint"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-display text-[15px] font-semibold">{preset.title}</h4>
                      <div className="flex shrink-0 gap-1">
                        {types(preset).map((t) => (
                          <TypeBadge key={t} type={t} className="h-5 text-[10px]" />
                        ))}
                      </div>
                    </div>
                    <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground">{preset.teaches}</p>
                    {preset.variants.length > 1 && (
                      <span className="mt-3 text-xs text-faint">{preset.variants.length} variants</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <p className="mt-10 max-w-[70ch] text-xs text-muted-foreground">
        Every replay says where its numbers came from: Jev Lab&rsquo;s own run of the exact request, with
        the model id and date, or numbers quoted from docs.typesafe.ai, with the page. They show the
        shape of a result, not a benchmark, and a live run can differ.
      </p>
    </PageShell>
  )
}
