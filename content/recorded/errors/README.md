# Recorded TypeSafe error bodies

Produced by `npm run probe:errors` on 2026-09-21 against `jev-1.13.0`.

`docs.typesafe.ai/api` lists the status codes but never publishes a body shape,
and `lib/errors.ts` has to map one. These are the real responses.

## What the probe changed

Three things the docs implied turned out to be wrong, and the code now follows
the API rather than the docs:

1. **Most validation failures are `400`, not `422`.** Only FastAPI body-shape
   errors (missing `state`, empty `questions`) come back as 422.

2. **There are three different `detail` shapes**, not one:

   | Shape | Example |
   |---|---|
   | plain string | `{"detail": "Too many score levels. Must have at most 10 levels."}` |
   | coded object | `{"detail": {"error_type": "api_usage_error", "message": "Invalid request."}}` |
   | coded object, **no message** | `{"detail": {"error_type": "max_tokens_exceeded"}}` |
   | FastAPI issue array | `{"detail": [{"type": "too_short", "loc": ["body", "questions"], "msg": "…"}]}` |

   `max_tokens_exceeded` carries nothing but its code, so `lib/errors.ts` keeps
   friendly copy per `error_type`.

3. **The API accepts things the docs call minimums.** A Score with one level and
   a Choice with one option both return `200` (the single option comes back at
   probability 1.0). The docs' "should have at least two levels" is advice, so
   it belongs in the linter, not in `lib/schema.ts` — we never block a request
   TypeSafe would have answered.

Also worth knowing: **a Noul is valid with `criteria` and no `instructions`.**
The API's own words are `"Noul question must have criteria or instructions"`.

## Re-running

```bash
TYPESAFE_API_KEY=... npm run probe:errors
```

Every request here is rejected before inference, so the probe costs nothing
meaningful. Re-run it when the model alias moves and reconcile `lib/errors.ts`
with anything that changed.
