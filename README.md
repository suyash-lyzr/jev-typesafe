# Jev Lab by Lyzr

A free, no-login playground and course for [Jev](https://docs.typesafe.ai), TypeSafe AI's
decision model. Visitors send real requests through Lyzr's key, read the answers as
distributions, turn confidence into policy without extra calls, race Jev against an OpenAI
model, and see where Jev breaks, with the rewrite that fixes each case.

Not affiliated with or endorsed by TypeSafe AI.

## Routes

| Route | What it is |
|---|---|
| `/` | Landing page with a recorded first run you can re-run live |
| `/play` | The playground: editor ‖ Answers · Policy · Compare · JSON · Code |
| `/presets` | 12 presets, each with variants |
| `/learn`, `/learn/[slug]` | 6 lessons with live checkpoints |
| `/limits` | Where Jev breaks: 5 runnable fail/fix demos with checks |
| `/compare` | What the Jev-vs-LLM comparison measures, and what it doesn't |
| `/cheatsheet`, `/about`, `/privacy` | Reference and policy pages |
| `/api/jev`, `/api/compare`, `/api/status` | Proxy, comparison, budget state |

## Run it locally

```bash
npm install
cp .env.example .env.local   # then set TYPESAFE_API_KEY
npm run dev                  # http://localhost:3000
```

Only `TYPESAFE_API_KEY` is needed locally. Without Upstash, rate limits and spend caps are
off in development, and every live run is refused in production (it fails closed).
`.env.example` documents every variable.

## Deploy (Vercel)

1. Import the repo into Vercel. The framework preset is Next.js and needs no build settings.
2. Set these environment variables:
   - `TYPESAFE_API_KEY`
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (the free tier is fine)
   - `IP_HASH_SALT` (any long random string)
   - `NEXT_PUBLIC_SITE_URL` (the public URL)
3. Optional variables:
   - To turn on the comparison: `OPENAI_API_KEY`. Visitors pick from the eight models in
     `lib/llm-models.ts`, whose prices were checked on OpenAI's pricing page on 2026-09-22.
     `OPENAI_COMPARE_MODEL` sets the default (gpt-5.6-terra). Adding a model means checking
     its price and that it accepts the request (Chat Completions with a strict JSON schema).
   - `COMPARE_DAY`: free comparisons per network per UTC day (default 5). A comparison
     that never reached OpenAI is handed back.
   - `ALLOWED_ORIGINS`, for extra domains serving this same app.
   - `FRAME_ANCESTORS`, to allow embedding in an iframe.
   - `NEXT_PUBLIC_ISSUES_URL`, which turns on the "Report drift" links.
4. Emergency stop: set `JEVLAB_KILL_SWITCH=1` and redeploy. Unedited presets then show their
   recordings instead of running live.

The code assumes Vercel Hobby's ~10s function limit: every handler runs against a 9s
deadline. Note that Hobby's terms forbid commercial use; Pro removes that restriction.

### Abuse and spend controls

Hobby has no firewall, so all of this happens in the app:
- An origin check, which stops other sites from using the proxy.
- Per-IP limits per minute and per day, with IPv6 grouped by /64.
- Global limits per minute and per day.
- A daily dollar cap per provider, reserved before each call and settled against real usage
  afterwards.
- The kill switch.

Defaults are in `.env.example` (`DAILY_JEV_BUDGET_USD=10`, `PLAY_MIN=30`, …).

## Where the numbers come from

Every number on the site is one of two things:
- **Live**: from a response the visitor just triggered.
- **Recorded**: labelled with its source (a docs.typesafe.ai page, or "Jev Lab's own live
  run"), the model id and the date.

Nothing runs from a URL or on page load. The one exception is a one-shot token set by the
site's own "Run" launchers.

To re-record presets against the current model:

```bash
TYPESAFE_API_KEY=... npm run record -- --only=<preset-slug>   # add --force to overwrite
```

This writes JSON to `content/recorded/presets/` and regenerates its index. A recording is
only used while the preset's request still matches it byte for byte (it is matched by hash),
so editing a preset quietly drops its stale recording.

**The /limits demos show failures that were chosen.** The counting, date and injection cases
were picked because they failed on jev-1.13.0 on 2026-09-21, and their descriptions say so.
Re-check them after each model release, and update the prose if the model starts getting
them right.

## Project layout

```
app/                  routes and API handlers
components/           ui/ (Sage design system) · playground/ · lesson/ · limits/ · layout/
content/presets/      the 12 presets and their variants
content/lessons/      the 6 lessons
content/limits/       the /limits checks
content/recorded/     recorded responses (live/, presets/, errors/)
lib/                  schema (zod, shared by client and server) · store (zustand) ·
                      guards (limits, spend) · upstream · proxy · policy · codegen · share · lints
scripts/              record-presets.ts, probe-errors.ts
```

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind 3.4 (pinned, because the Sage
preset is v3), zustand, zod, CodeMirror 6, Upstash Redis.

## Checks

```bash
npm run typecheck
npm run build
```
