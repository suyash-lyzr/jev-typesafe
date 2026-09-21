import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/chrome'
import { PRICING } from '@/lib/pricing'

export const metadata: Metadata = {
  title: 'Cheatsheet',
  description: 'One page: the three question types, the limits, the patterns and the failure modes.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export default function CheatsheetPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Jev cheatsheet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything that fits on one page. Print it.
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <Section title="The three question types">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1.5 font-medium">Type</th>
                <th className="py-1.5 font-medium">Returns</th>
                <th className="py-1.5 font-medium">Limits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              <tr>
                <td className="py-2 font-mono text-xs">choice</td>
                <td className="py-2 text-xs">choice, probabilities, confidence</td>
                <td className="py-2 text-xs">up to 255 options</td>
              </tr>
              <tr>
                <td className="py-2 font-mono text-xs">score</td>
                <td className="py-2 text-xs">score, legend, probabilities, confidence</td>
                <td className="py-2 text-xs">2–10 levels</td>
              </tr>
              <tr>
                <td className="py-2 font-mono text-xs">noul</td>
                <td className="py-2 text-xs">
                  noul (0–1). <strong>No confidence field.</strong>
                </td>
                <td className="py-2 text-xs">one condition each</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="Limits and price">
          <ul className="space-y-1 text-sm">
            <li>
              <span className="font-mono text-xs">${PRICING.jev.inPerM}</span> per 1M input tokens ·
              output free
            </li>
            <li>64k tokens per request; 32k for state + the longest question</li>
            <li>250k tokens/sec · 1,200 requests/min</li>
            <li>Text only: string, object, or array of text</li>
            <li>English is most accurate; CJK is handled but weaker</li>
            <li>
              <span className="font-mono text-xs">jev-latest</span> and{' '}
              <span className="font-mono text-xs">jev-preview</span> both point at{' '}
              <span className="font-mono text-xs">jev-1.13.0</span>. Pin the version if you have
              tuned thresholds.
            </li>
          </ul>
        </Section>

        <Section title="Choosing a type">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Choice</strong> — one of a known set, no order
              between them. Always add an escape option; probabilities sum to 1, so without one the
              model must pick something.
            </li>
            <li>
              <strong className="text-foreground">Score</strong> — a position on a spectrum you can
              describe in steps. Describe situations, not degrees.
            </li>
            <li>
              <strong className="text-foreground">Noul</strong> — a clean yes/no where the
              probability itself is the signal. 0.5 means &ldquo;equally likely&rdquo;, not
              &ldquo;medium&rdquo;.
            </li>
          </ul>
        </Section>

        <Section title="Patterns">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Speculative fan-out</strong> — ask everything you
              might need in one request and ignore what does not apply. One documented test: 12.2×
              cheaper and 10× faster than 13 separate calls, same answers.
            </li>
            <li>
              <strong className="text-foreground">Confidence-gated routing</strong> — the answer says
              what, confidence says whether to act.
            </li>
            <li>
              <strong className="text-foreground">Composite scoring</strong> — split a judgment into
              several Scores, normalise each by <span className="font-mono text-xs">levels − 1</span>
              , weight them in your code.
            </li>
            <li>
              <strong className="text-foreground">Intent routing</strong> — Jev classifies, then
              code, a specialist LLM, or a human handles it.
            </li>
          </ul>
        </Section>

        <Section title="Where jev-1.13 breaks">
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>Literal reading of your instruction</li>
            <li>Arithmetic, counting, hex and other numeric forms</li>
            <li>Comparing dates</li>
            <li>Indirection and double negatives</li>
            <li>Large states full of irrelevant detail</li>
            <li>Adversarial or injected content</li>
            <li>Instructions that contradict their criteria</li>
            <li>Structural invariants: P(yes) + P(not yes) ≠ 1</li>
            <li>Generating text — it cannot</li>
          </ol>
        </Section>

        <Section title="Tricks worth knowing">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>Pair a Choice with a Noul so the system can answer &ldquo;none of these&rdquo;.</li>
            <li>Combine per-field confidences with min, not a product — a product falls with arity.</li>
            <li>Let Jev pick from candidates you found in code rather than generate a value.</li>
            <li>Cache answers so you can re-tune thresholds without spending anything.</li>
            <li>
              Point questions at parts of a structured state with backticks:{' '}
              <span className="font-mono text-xs">`ticket.messages[0].text`</span>.
            </li>
            <li>A Noul is valid with criteria and no instructions.</li>
          </ul>
        </Section>
      </div>

      <Section title="A minimal request">
        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[11px] leading-relaxed">
{`POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY

{
  "state": "My card was charged twice.",
  "model": "jev-latest",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": { "billing": "Charges and refunds",
                    "technical": "Bugs and integrations",
                    "other": "None of the above" }
    },
    "is_urgent": { "type": "noul", "instructions": "Does this convey urgency?" }
  }
}`}
        </pre>
      </Section>
    </PageShell>
  )
}
