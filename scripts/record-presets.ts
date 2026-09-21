/**
 * Record real Jev responses for preset variants.
 *
 * Presets show an answer before the reader spends anything, and that answer has
 * to be something Jev actually said — with the model id and date attached, so a
 * replay can never be mistaken for a live run. This sends each variant once and
 * writes what came back.
 *
 *   TYPESAFE_API_KEY=... npm run record
 *   TYPESAFE_API_KEY=... npm run record -- --only=bug-severity
 *   TYPESAFE_API_KEY=... npm run record -- --force
 *
 * It never edits content/presets/*.ts. Rewriting hand-written source from a
 * script would lose the prose around each number, so the output is a JSON file
 * plus a paste-ready `recorded:` block for the variant it belongs to.
 *
 * Three states, and the default only touches the first:
 *   recorded undefined  — nobody has looked. Recorded.
 *   recorded null       — deliberately left unrecorded, and some pages say so
 *                         in prose. Needs --include-null.
 *   recorded {...}      — already has an answer. Needs --force.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { allPresets, getVariant } from '@/content/presets'
import type { Preset, PresetVariant } from '@/content/presets'
import { DEFAULT_MODEL } from '@/lib/schema'
import type { Answer, Usage } from '@/lib/schema'
import { jevCostUsd, formatUsd } from '@/lib/pricing'

const URL = 'https://api.typesafe.ai/v1/systemone'
const KEY = process.env.TYPESAFE_API_KEY

/** Well under the 1,200 rpm shared limit, and kind to a shared key. */
const PAUSE_MS = 400

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const value = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const ONLY = value('only')
const FORCE = flag('force')
const INCLUDE_NULL = flag('include-null')
const DRY_RUN = flag('dry-run')

if (!KEY && !DRY_RUN) {
  console.error('Set TYPESAFE_API_KEY first. Get one at https://console.typesafe.ai/keys')
  process.exit(1)
}

type Reason = 'unrecorded' | 'null' | 'existing'

interface Target {
  preset: Preset
  variant: PresetVariant
  reason: Reason
}

function targets(): { run: Target[]; skipped: Target[] } {
  const run: Target[] = []
  const skipped: Target[] = []

  for (const preset of allPresets) {
    if (ONLY && preset.slug !== ONLY) continue

    for (const variant of preset.variants) {
      const reason: Reason =
        variant.recorded === undefined ? 'unrecorded' : variant.recorded === null ? 'null' : 'existing'

      const wanted =
        reason === 'unrecorded' || (reason === 'null' && INCLUDE_NULL) || (reason === 'existing' && FORCE)

      ;(wanted ? run : skipped).push({ preset, variant, reason })
    }
  }

  return { run, skipped }
}

/** A variant may replace the questions outright; the playground resolves it the same way. */
function requestFor(preset: Preset, variant: PresetVariant) {
  return {
    state: variant.state,
    model: DEFAULT_MODEL,
    questions: getVariant(preset, variant.id).questions ?? preset.questions,
  }
}

/** The TS block to paste into the variant, so the prose around it stays hand-written. */
function snippet(model: string, answers: Record<string, Answer>, usage: Usage): string {
  const body = {
    source: 'ours',
    model,
    date: new Date().toISOString().slice(0, 10),
    answers,
    usage,
  }

  return (
    `        recorded: ` +
    JSON.stringify(body, null, 2)
      .split('\n')
      .join('\n        ')
      .replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, '$1:')
      .replace(/"/g, "'") +
    `,`
  )
}

async function main() {
  const { run, skipped } = targets()

  if (run.length === 0) {
    console.log('Nothing to record.')
    for (const t of skipped) {
      const how = t.reason === 'existing' ? '--force' : '--include-null'
      console.log(`  skip ${t.preset.slug}/${t.variant.id}  (${t.reason}; ${how} to include)`)
    }
    return
  }

  const outDir = join(process.cwd(), 'content', 'recorded', 'presets')
  if (!DRY_RUN) mkdirSync(outDir, { recursive: true })

  console.log(
    `${run.length} variant${run.length === 1 ? '' : 's'} to record, ${skipped.length} skipped.` +
      (DRY_RUN ? ' Dry run: nothing will be sent.\n' : '\n')
  )

  const snippets: string[] = []
  let totalCost = 0
  let failures = 0

  for (const { preset, variant, reason } of run) {
    const label = `${preset.slug}/${variant.id}`
    const request = requestFor(preset, variant)
    const nQuestions = Object.keys(request.questions).length

    if (DRY_RUN) {
      console.log(`${label.padEnd(40)} ${nQuestions} questions  (${reason})`)
      continue
    }

    process.stdout.write(`${label.padEnd(40)} `)

    try {
      const startedAt = Date.now()
      const res = await fetch(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const ms = Date.now() - startedAt
      const text = await res.text()

      if (!res.ok) {
        console.log(`${res.status}  ${text.slice(0, 140)}`)
        failures++
        continue
      }

      const body = JSON.parse(text) as { model: string; answers: Record<string, Answer>; usage: Usage }
      const costUsd = jevCostUsd(body.usage.input_tokens)
      totalCost += costUsd

      // A missing answer means the request and the preset have drifted apart,
      // and a replay with a hole in it is worse than no replay.
      const missing = Object.keys(request.questions).filter((id) => !(id in body.answers))
      if (missing.length > 0) {
        console.log(`unanswered: ${missing.join(', ')}`)
        failures++
        continue
      }

      const record = {
        preset: preset.slug,
        variant: variant.id,
        recordedAt: new Date().toISOString(),
        model: body.model,
        request,
        answers: body.answers,
        usage: body.usage,
        costUsd,
        clientMs: ms,
      }

      writeFileSync(
        join(outDir, `${preset.slug}__${variant.id}.json`),
        JSON.stringify(record, null, 2) + '\n'
      )

      snippets.push(`// ${label}\n${snippet(body.model, body.answers, body.usage)}`)
      console.log(`${body.model}  ${nQuestions}q  ${ms} ms  ${formatUsd(costUsd)}`)
    } catch (err) {
      console.log(`failed: ${String(err)}`)
      failures++
    }

    await new Promise((r) => setTimeout(r, PAUSE_MS))
  }

  if (DRY_RUN) return

  console.log(`\nWrote ${snippets.length} record(s) to content/recorded/presets/`)
  console.log(`Spent ${formatUsd(totalCost)}${failures > 0 ? ` · ${failures} failed` : ''}`)

  if (snippets.length > 0) {
    console.log(
      '\nPaste each block into its variant in content/presets/, then write the note yourself —\n' +
        'source is set to "ours" and the date is today; a number without its conditions is noise.\n'
    )
    console.log(snippets.join('\n\n'))
  }
}

main()
