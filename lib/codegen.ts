import type { JevRequest, Question } from './schema'
import type { Policy, Rule } from './policy'
import { resolveRuleTarget } from './policy'

/**
 * "Copy this into your codebase" — the moment the playground stops being a toy.
 *
 * The generated code carries the policy thresholds as named constants, because
 * the thresholds are the part a team argues about and the part that belongs
 * under review.
 *
 * Everything that reaches the output is treated as untrusted, because it can
 * arrive from a shared link: numbers are coerced to numbers, strings are
 * emitted only as escaped literals, identifiers are rebuilt from a safe
 * alphabet, and comments are single-line. An earlier version pasted a
 * threshold in verbatim, and a crafted link could put a working
 * `import os; os.system(...)` line into someone's copied Python.
 */

export type CodeLang = 'curl' | 'python' | 'typescript'

// ---------------------------------------------------------------------------
// Safe emitters
// ---------------------------------------------------------------------------

/** A finite number in [0, 1], or 0. Thresholds are the only numbers emitted. */
function threshold(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000
}

/** A free-standing number (a score threshold can exceed 1). */
function finite(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 10_000) / 10_000 : 0
}

/** One line, no comment terminators: safe inside `#` and `//` comments. */
function commentText(v: unknown): string {
  return String(v ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/\*\//g, '* /')
    .slice(0, 120)
}

/** A string literal both Python and TypeScript accept. */
const str = (v: unknown) => JSON.stringify(String(v ?? ''))

/** `is-urgent` → `is_urgent`, `2fa` → `_2fa`. Never empty, never a keyword clash. */
function ident(raw: unknown, fallback = 'value'): string {
  let id = String(raw ?? '').replace(/[^A-Za-z0-9_]/g, '_')
  if (!id) id = fallback
  if (/^[0-9]/.test(id)) id = `_${id}`
  return id
}

function constName(id: string, prefix: string): string {
  return `${prefix}_${ident(id).replace(/^_+/, '')}`.toUpperCase()
}

/**
 * Distinct names for repeated rules on the same question. Every emitted name
 * is remembered, so ACT_X twice (→ ACT_X_2) cannot collide with a question
 * that is itself called x_2.
 */
function uniquer() {
  const emitted = new Set<string>()
  return (name: string) => {
    let candidate = name
    for (let n = 2; emitted.has(candidate); n++) candidate = `${name}_${n}`
    emitted.add(candidate)
    return candidate
  }
}

/**
 * The callback a flag rule invokes. Always prefixed, so a label like "exit",
 * "class" or "print" can never become a keyword or shadow a builtin.
 */
function flagFn(label: string): string {
  return `flag_${ident(label, 'raised').replace(/^_+/, '')}`
}

function py(v: unknown, depth = 0): string {
  const pad = '    '.repeat(depth + 1)
  const close = '    '.repeat(depth)
  if (v === null || v === undefined) return 'None'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'None'
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return `[\n${v.map((x) => `${pad}${py(x, depth + 1)},`).join('\n')}\n${close}]`
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    return `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${py(x, depth + 1)},`).join('\n')}\n${close}}`
  }
  return 'None'
}

const tsLit = (v: unknown, depth = 0) =>
  JSON.stringify(v ?? null, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  '.repeat(depth) + line))
    .join('\n')

// ---------------------------------------------------------------------------
// Rules, resolved against the wire request
// ---------------------------------------------------------------------------

/**
 * Policy rules are keyed by the editor's question id; on the wire an A/B pair
 * becomes `<id>__A` and `<id>__B`. Rules follow variant A, and a rule for a
 * question that is not in the request is dropped rather than emitted as a
 * KeyError waiting to happen.
 */
function resolvedRules(request: JevRequest, policy?: Policy): Array<Rule & { target: string }> {
  const out: Array<Rule & { target: string }> = []
  for (const rule of policy?.rules ?? []) {
    const target = resolveRuleTarget(rule.q, request.questions)
    if (!target) continue
    if (rule.kind === 'grey_unless') {
      const dep = resolveRuleTarget(rule.dependsOn, request.questions)
      // The condition reads `.choice`, so the dependency must be a Choice.
      if (!dep || request.questions[dep]?.type !== 'choice') continue
      out.push({ ...rule, dependsOn: dep, target })
      continue
    }
    // Each rule reads a field only one type has; emit it only for that type.
    const type = request.questions[target]?.type
    if (rule.kind === 'band' && type === 'noul') continue // no `.confidence`
    if (rule.kind === 'noul' && type !== 'noul') continue
    if (rule.kind === 'copy_if_p_gt' && type !== 'choice') continue // `.probabilities`
    if (rule.kind === 'flag_if_score_gte' && type !== 'score') continue // `.score`
    out.push({ ...rule, target })
  }
  return out
}

// ---------------------------------------------------------------------------
// cURL
// ---------------------------------------------------------------------------

export function generateCurl(request: JevRequest): string {
  const body = JSON.stringify(request, null, 2)
  // The heredoc ends at the first line equal to the delimiter; make sure the
  // body can never contain it.
  let delimiter = 'JEVLAB_REQUEST'
  while (body.split('\n').some((line) => line.trim() === delimiter)) delimiter += '_'
  return `curl -X POST https://api.typesafe.ai/v1/systemone \\
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<'${delimiter}'
${body}
${delimiter}`
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function pythonQuestion(q: Question): string {
  const hasInstructions = q.instructions !== undefined && q.instructions !== null
  const instructions = hasInstructions ? `instructions=${py(q.instructions, 2)},` : ''

  if (q.type === 'choice') {
    return `Choice(
        ${instructions}
        criteria=${py(q.criteria, 2)},
    )`
  }

  if (q.type === 'score') {
    return `Score(
        ${instructions}
        criteria=${py(q.criteria, 2)},
    )`
  }

  const parts = [instructions]
  if (q.criteria) {
    parts.push(`criteria=NoulCriteria(true=${py(q.criteria.true, 2)}, false=${py(q.criteria.false, 2)}),`)
  }
  return `Noul(
        ${parts.filter(Boolean).join('\n        ')}
    )`
}

export function generatePython(request: JevRequest, policy?: Policy): string {
  const usesNoulCriteria = Object.values(request.questions).some((q) => q.type === 'noul' && q.criteria)
  const imports = ['Choice', 'Noul', ...(usesNoulCriteria ? ['NoulCriteria'] : []), 'Score', 'TypeSafeClient'].sort()

  const questions = Object.entries(request.questions)
    .map(([id, q]) => `    ${JSON.stringify(id)}: ${pythonQuestion(q)},`)
    .join('\n')

  const rules = resolvedRules(request, policy)
  const policyBlock = rules.length ? '\n\n' + pythonPolicy(rules) : ''

  return `from typesafe_sdk import ${imports.join(', ')}

STATE = ${py(request.state)}

QUESTIONS = {
${questions}
}

with TypeSafeClient() as client:
    response = client.system_one(
        state=STATE,
        model=${str(request.model)},
        questions=QUESTIONS,
    )

answers = response.answers${policyBlock}`
}

function pythonPolicy(rules: Array<Rule & { target: string }>): string {
  const constants: string[] = []
  const branches: string[] = []
  const unique = uniquer()

  for (const rule of rules) {
    const key = str(rule.target)
    const label = commentText(rule.target)

    switch (rule.kind) {
      case 'band': {
        const act = unique(constName(rule.target, 'ACT'))
        const review = unique(constName(rule.target, 'REVIEW'))
        constants.push(`${act} = ${threshold(rule.act)}`, `${review} = ${threshold(rule.review)}`)
        branches.push(`# ${label}
confidence = answers[${key}].confidence
if confidence >= ${act}:
    act_on(answers[${key}])
elif confidence >= ${review}:
    send_to_review(answers[${key}])
else:
    escalate_to_human(answers[${key}])`)
        break
      }
      case 'noul': {
        const yes = unique(constName(rule.target, 'YES'))
        const no = unique(constName(rule.target, 'NO'))
        constants.push(`${yes} = ${threshold(rule.yes)}`, `${no} = ${threshold(rule.no)}`)
        branches.push(`# ${label}
value = answers[${key}].noul
if value >= ${yes}:
    on_yes()
elif value < ${no}:
    on_no()
else:
    send_to_review(value)`)
        break
      }
      case 'copy_if_p_gt': {
        const name = unique(constName(rule.target, 'COPY'))
        constants.push(`${name} = ${threshold(rule.threshold)}`)
        branches.push(`# ${label}: a runner-up with a real share still gets told
chosen = answers[${key}].choice
for option, probability in answers[${key}].probabilities.items():
    if option != chosen and probability > ${name}:
        notify(option)`)
        break
      }
      case 'flag_if_score_gte': {
        const name = unique(constName(rule.target, 'FLAG'))
        constants.push(`${name} = ${finite(rule.threshold)}`)
        branches.push(`# ${label}: ${commentText(rule.label)}
if answers[${key}].score >= ${name}:
    ${flagFn(rule.label).toLowerCase()}()`)
        break
      }
      case 'grey_unless': {
        branches.push(`# ${label} only matters when ${commentText(rule.dependsOn)} is ${commentText(rule.equals.join(' or '))}
if answers[${str(rule.dependsOn)}].choice in [${rule.equals.map(str).join(', ')}]:
    use(answers[${key}])`)
        break
      }
    }
  }

  return `# --- policy: your code, not the model -------------------------------------
# Changing a threshold re-decides the case. It never calls Jev again.
${constants.join('\n')}

${branches.join('\n\n')}`
}

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

function tsQuestion(q: Question): string {
  const instructions = q.instructions === undefined ? 'undefined' : tsLit(q.instructions, 2)

  if (q.type === 'choice') return `choice(${instructions}, ${tsLit(q.criteria, 2)})`
  if (q.type === 'score') return `score(${instructions}, ${tsLit(q.criteria, 2)})`

  if (q.criteria) {
    const criteria = `{ true: ${tsLit(q.criteria.true)}, false: ${tsLit(q.criteria.false)} }`
    // A criteria-only Noul is written out in full rather than through the helper.
    return q.instructions === undefined || q.instructions === null
      ? `{ type: "noul", criteria: ${criteria} }`
      : `noul(${instructions}, ${criteria})`
  }
  return `noul(${instructions})`
}

export function generateTypeScript(request: JevRequest, policy?: Policy): string {
  const used = new Set(Object.values(request.questions).map((q) => q.type))
  const helpers = (['choice', 'noul', 'score'] as const).filter((h) => used.has(h))

  const questions = Object.entries(request.questions)
    .map(([id, q]) => `    ${JSON.stringify(id)}: ${tsQuestion(q)},`)
    .join('\n')

  const rules = resolvedRules(request, policy)
  const policyBlock = rules.length ? '\n\n' + tsPolicy(rules) : ''

  return `import { TypeSafeClient${helpers.length ? `, ${helpers.join(', ')}` : ''} } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const state = ${tsLit(request.state)};

const response = await client.systemOne({
  state,
  model: ${str(request.model)},
  questions: {
${questions}
  },
});

const answers = response.answers;${policyBlock}`
}

function tsPolicy(rules: Array<Rule & { target: string }>): string {
  const constants: string[] = []
  const branches: string[] = []
  const unique = uniquer()

  for (const rule of rules) {
    const key = str(rule.target)
    const label = commentText(rule.target)

    // Each rule sits in its own block, so its locals cannot collide with the
    // next rule's — two copy rules used to redeclare the same const.
    switch (rule.kind) {
      case 'band': {
        const act = unique(constName(rule.target, 'ACT'))
        const review = unique(constName(rule.target, 'REVIEW'))
        constants.push(`const ${act} = ${threshold(rule.act)};`, `const ${review} = ${threshold(rule.review)};`)
        branches.push(`// ${label}
{
  const answer = answers[${key}];
  if (answer.confidence >= ${act}) actOn(answer);
  else if (answer.confidence >= ${review}) sendToReview(answer);
  else escalateToHuman(answer);
}`)
        break
      }
      case 'noul': {
        const yes = unique(constName(rule.target, 'YES'))
        const no = unique(constName(rule.target, 'NO'))
        constants.push(`const ${yes} = ${threshold(rule.yes)};`, `const ${no} = ${threshold(rule.no)};`)
        branches.push(`// ${label}
{
  const value = answers[${key}].noul;
  if (value >= ${yes}) onYes();
  else if (value < ${no}) onNo();
  else sendToReview(value);
}`)
        break
      }
      case 'copy_if_p_gt': {
        const name = unique(constName(rule.target, 'COPY'))
        constants.push(`const ${name} = ${threshold(rule.threshold)};`)
        branches.push(`// ${label}: a runner-up with a real share still gets told
{
  const { choice: chosen, probabilities } = answers[${key}];
  for (const [option, probability] of Object.entries(probabilities as Record<string, number>)) {
    if (option !== chosen && probability > ${name}) notify(option);
  }
}`)
        break
      }
      case 'flag_if_score_gte': {
        const name = unique(constName(rule.target, 'FLAG'))
        constants.push(`const ${name} = ${finite(rule.threshold)};`)
        branches.push(`// ${label}: ${commentText(rule.label)}
if (answers[${key}].score >= ${name}) ${flagFn(rule.label)}();`)
        break
      }
      case 'grey_unless': {
        branches.push(`// ${label} only matters when ${commentText(rule.dependsOn)} is ${commentText(rule.equals.join(' or '))}
if ([${rule.equals.map(str).join(', ')}].includes(answers[${str(rule.dependsOn)}].choice)) {
  use(answers[${key}]);
}`)
        break
      }
    }
  }

  return `// --- policy: your code, not the model -------------------------------------
// Changing a threshold re-decides the case. It never calls Jev again.
${constants.join('\n')}

${branches.join('\n\n')}`
}

export function generateCode(lang: CodeLang, request: JevRequest, policy?: Policy): string {
  if (lang === 'curl') return generateCurl(request)
  if (lang === 'python') return generatePython(request, policy)
  return generateTypeScript(request, policy)
}
