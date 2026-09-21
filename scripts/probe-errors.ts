/**
 * Day-1 probe: record TypeSafe's real error bodies.
 *
 * docs.typesafe.ai/api says a 422 "details the offending field" but never
 * publishes the shape, and three features depend on one (mirroring it in the
 * proxy, quoting the message verbatim, and jumping to the offending question).
 * This sends deliberately invalid requests once and commits what comes back,
 * so lib/upstream.ts#normaliseUpstreamError can be written against fact.
 *
 *   TYPESAFE_API_KEY=... npm run probe:errors
 *
 * Costs nothing meaningful: every request is rejected before inference.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL = 'https://api.typesafe.ai/v1/systemone'
const KEY = process.env.TYPESAFE_API_KEY

if (!KEY) {
  console.error('Set TYPESAFE_API_KEY first. Get one at https://console.typesafe.ai/keys')
  process.exit(1)
}

const validState = 'My card was charged twice.'

const cases: Array<{ name: string; body: unknown; expect: string }> = [
  {
    name: 'score-11-levels',
    expect: '422 — the docs say 2–10 levels; 11 should be rejected',
    body: {
      state: validState,
      model: 'jev-latest',
      questions: {
        severity: {
          type: 'score',
          instructions: 'How severe is this?',
          criteria: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'],
        },
      },
    },
  },
  {
    name: 'score-1-level',
    expect: '422 — below the 2-level minimum',
    body: {
      state: validState,
      model: 'jev-latest',
      questions: { severity: { type: 'score', instructions: 'How severe?', criteria: ['only'] } },
    },
  },
  {
    name: 'choice-256-options',
    expect: '422 — one past the 255 cap',
    body: {
      state: validState,
      model: 'jev-latest',
      questions: {
        pick: {
          type: 'choice',
          instructions: 'Pick one',
          criteria: Object.fromEntries(
            Array.from({ length: 256 }, (_, i) => [`opt_${i}`, `Option ${i}`])
          ),
        },
      },
    },
  },
  {
    name: 'choice-one-option',
    expect: '422 — a Choice needs at least two options',
    body: {
      state: validState,
      model: 'jev-latest',
      questions: { pick: { type: 'choice', instructions: 'Pick one', criteria: { only: null } } },
    },
  },
  {
    name: 'empty-instructions',
    expect: '422 — instructions carry the whole question',
    body: {
      state: validState,
      model: 'jev-latest',
      questions: { urgent: { type: 'noul', instructions: '' } },
    },
  },
  {
    name: 'missing-instructions',
    expect: '422 — required field absent',
    body: { state: validState, model: 'jev-latest', questions: { urgent: { type: 'noul' } } },
  },
  {
    name: 'unknown-type',
    expect: '422 — only choice, score and noul exist',
    body: {
      state: validState,
      model: 'jev-latest',
      questions: { urgent: { type: 'boolean', instructions: 'Is it urgent?' } },
    },
  },
  {
    name: 'no-questions',
    expect: '422 — nothing to answer',
    body: { state: validState, model: 'jev-latest', questions: {} },
  },
  {
    name: 'bad-model',
    expect: '404 or 422 — unknown model id',
    body: {
      state: validState,
      model: 'jev-does-not-exist',
      questions: { urgent: { type: 'noul', instructions: 'Is it urgent?' } },
    },
  },
  {
    name: 'missing-state',
    expect: '422 — state is required',
    body: {
      model: 'jev-latest',
      questions: { urgent: { type: 'noul', instructions: 'Is it urgent?' } },
    },
  },
  {
    name: 'oversized-state',
    expect: '422 — past the 32k-token state budget',
    body: {
      state: 'lorem ipsum dolor sit amet '.repeat(8000),
      model: 'jev-latest',
      questions: { urgent: { type: 'noul', instructions: 'Is it urgent?' } },
    },
  },
]

async function main() {
  const outDir = join(process.cwd(), 'content', 'recorded', 'errors')
  mkdirSync(outDir, { recursive: true })

  const summary: Array<Record<string, unknown>> = []

  for (const c of cases) {
    process.stdout.write(`${c.name.padEnd(22)} `)
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(c.body),
      })

      const text = await res.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }

      const record = {
        case: c.name,
        expect: c.expect,
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: parsed,
      }

      writeFileSync(join(outDir, `${c.name}.json`), JSON.stringify(record, null, 2) + '\n')
      summary.push({ case: c.name, status: res.status, keys: topLevelKeys(parsed) })
      console.log(`${res.status}  ${JSON.stringify(parsed).slice(0, 120)}`)
    } catch (err) {
      console.log(`failed: ${String(err)}`)
      summary.push({ case: c.name, error: String(err) })
    }

    // Stay well under the 1,200 rpm shared limit.
    await new Promise((r) => setTimeout(r, 250))
  }

  writeFileSync(join(outDir, '_summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(`\nWrote ${summary.length} records to content/recorded/errors/`)
  console.log('Now reconcile lib/upstream.ts#normaliseUpstreamError with the real shape.')
}

function topLevelKeys(v: unknown): string[] | string {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object) : typeof v
}

main()
