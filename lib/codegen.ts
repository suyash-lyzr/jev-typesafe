import type { JevRequest, Question } from './schema'
import type { Policy, Rule } from './policy'

/**
 * "Copy this into your codebase" — the moment the playground stops being a toy.
 *
 * The generated code carries the policy thresholds as named constants, because
 * the thresholds are the part a team argues about and the part that belongs
 * under review.
 */

export type CodeLang = 'curl' | 'python' | 'typescript'

const indent = (text: string, spaces: number) =>
  text
    .split('\n')
    .map((line) => (line ? ' '.repeat(spaces) + line : line))
    .join('\n')

const py = (v: unknown): string => {
  if (v === null) return 'None'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (Array.isArray(v)) return `[${v.map(py).join(', ')}]`
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    return `{${entries.map(([k, val]) => `${JSON.stringify(k)}: ${py(val)}`).join(', ')}}`
  }
  return String(v)
}

const ts = (v: unknown): string => JSON.stringify(v)

const constName = (id: string, suffix: string) =>
  `${suffix}_${id.replace(/[^A-Za-z0-9]/g, '_')}`.toUpperCase()

// ---------------------------------------------------------------------------
// cURL
// ---------------------------------------------------------------------------

export function generateCurl(request: JevRequest): string {
  const body = JSON.stringify(request, null, 2)
  return `curl -X POST https://api.typesafe.ai/v1/systemone \\
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<'EOF'
${body}
EOF`
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function pythonQuestion(q: Question): string {
  const instructions = py(q.instructions)

  if (q.type === 'choice') {
    const criteria = Object.entries(q.criteria)
      .map(([key, desc]) => `        ${JSON.stringify(key)}: ${py(desc)},`)
      .join('\n')
    return `Choice(
        instructions=${instructions},
        criteria={
${criteria}
        },
    )`
  }

  if (q.type === 'score') {
    const levels = q.criteria.map((level) => `            ${py(level)},`).join('\n')
    return `Score(
        instructions=${instructions},
        criteria=[
${levels}
        ],
    )`
  }

  if (q.criteria) {
    return `Noul(
        instructions=${instructions},
        criteria=NoulCriteria(true=${py(q.criteria.true)}, false=${py(q.criteria.false)}),
    )`
  }
  return `Noul(instructions=${instructions})`
}

export function generatePython(request: JevRequest, policy?: Policy): string {
  const usesNoulCriteria = Object.values(request.questions).some(
    (q) => q.type === 'noul' && q.criteria
  )
  const imports = ['Choice', 'Noul', ...(usesNoulCriteria ? ['NoulCriteria'] : []), 'Score', 'TypeSafeClient']
    .filter((name, i, all) => all.indexOf(name) === i)
    .sort()

  const questions = Object.entries(request.questions)
    .map(([id, q]) => `    ${JSON.stringify(id)}: ${pythonQuestion(q)},`)
    .join('\n')

  const state =
    typeof request.state === 'string'
      ? py(request.state)
      : JSON.stringify(request.state, null, 4).replace(/"([^"]+)":/g, '"$1":')

  const policyBlock = policy?.rules.length ? '\n\n' + pythonPolicy(policy) : ''

  return `from typesafe_sdk import ${imports.join(', ')}

STATE = ${state}

QUESTIONS = {
${questions}
}

with TypeSafeClient() as client:
    response = client.system_one(
        state=STATE,
        model=${py(request.model)},
        questions=QUESTIONS,
    )

answers = response.answers${policyBlock}`
}

function pythonPolicy(policy: Policy): string {
  const constants: string[] = []
  const branches: string[] = []

  for (const rule of policy.rules) {
    switch (rule.kind) {
      case 'band': {
        const act = constName(rule.q, 'ACT')
        const review = constName(rule.q, 'REVIEW')
        constants.push(`${act} = ${rule.act}`, `${review} = ${rule.review}`)
        branches.push(`# ${rule.q}
confidence = answers[${JSON.stringify(rule.q)}].confidence
if confidence >= ${act}:
    act_on(answers[${JSON.stringify(rule.q)}])
elif confidence >= ${review}:
    send_to_review(answers[${JSON.stringify(rule.q)}])
else:
    escalate_to_human(answers[${JSON.stringify(rule.q)}])`)
        break
      }
      case 'noul': {
        const yes = constName(rule.q, 'YES')
        const no = constName(rule.q, 'NO')
        constants.push(`${yes} = ${rule.yes}`, `${no} = ${rule.no}`)
        branches.push(`# ${rule.q}
value = answers[${JSON.stringify(rule.q)}].noul
if value >= ${yes}:
    on_yes()
elif value <= ${no}:
    on_no()
else:
    send_to_review(value)`)
        break
      }
      case 'copy_if_p_gt': {
        const name = constName(rule.q, 'COPY')
        constants.push(`${name} = ${rule.threshold}`)
        branches.push(`# ${rule.q}: a runner-up with a real share still gets told
chosen = answers[${JSON.stringify(rule.q)}].choice
for option, probability in answers[${JSON.stringify(rule.q)}].probabilities.items():
    if option != chosen and probability > ${name}:
        notify(option)`)
        break
      }
      case 'flag_if_score_gte': {
        const name = constName(rule.q, 'FLAG')
        constants.push(`${name} = ${rule.threshold}`)
        branches.push(`# ${rule.q}
if answers[${JSON.stringify(rule.q)}].score >= ${name}:
    ${rule.label.replace(/\W+/g, '_').toLowerCase()}()`)
        break
      }
      case 'grey_unless': {
        branches.push(`# ${rule.q} only matters when ${rule.dependsOn} is ${rule.equals.join(' or ')}
if answers[${JSON.stringify(rule.dependsOn)}].choice in ${py(rule.equals)}:
    use(answers[${JSON.stringify(rule.q)}])`)
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
  if (q.type === 'choice') {
    const criteria = Object.entries(q.criteria)
      .map(([key, desc]) => `      ${JSON.stringify(key)}: ${ts(desc)},`)
      .join('\n')
    return `choice(${ts(q.instructions)}, {
${criteria}
    })`
  }
  if (q.type === 'score') {
    const levels = q.criteria.map((l) => `      ${ts(l)},`).join('\n')
    return `score(${ts(q.instructions)}, [
${levels}
    ])`
  }
  return q.criteria
    ? `noul(${ts(q.instructions)}, { true: ${ts(q.criteria.true)}, false: ${ts(q.criteria.false)} })`
    : `noul(${ts(q.instructions)})`
}

export function generateTypeScript(request: JevRequest, policy?: Policy): string {
  const used = new Set(Object.values(request.questions).map((q) => q.type))
  const helpers = ['choice', 'noul', 'score'].filter((h) => used.has(h as any))

  const questions = Object.entries(request.questions)
    .map(([id, q]) => `    ${JSON.stringify(id)}: ${tsQuestion(q)},`)
    .join('\n')

  const state =
    typeof request.state === 'string' ? ts(request.state) : JSON.stringify(request.state, null, 2)

  const policyBlock = policy?.rules.length ? '\n\n' + tsPolicy(policy) : ''

  return `import { TypeSafeClient, ${helpers.join(', ')} } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const state = ${state};

const response = await client.systemOne({
  state,
  model: ${ts(request.model)},
  questions: {
${questions}
  },
});

const answers = response.answers;${policyBlock}`
}

function tsPolicy(policy: Policy): string {
  const constants: string[] = []
  const branches: string[] = []

  for (const rule of policy.rules) {
    switch (rule.kind) {
      case 'band': {
        const act = constName(rule.q, 'ACT')
        const review = constName(rule.q, 'REVIEW')
        constants.push(`const ${act} = ${rule.act};`, `const ${review} = ${rule.review};`)
        branches.push(`// ${rule.q}
const ${rule.q}Confidence = answers[${ts(rule.q)}].confidence;
if (${rule.q}Confidence >= ${act}) {
  actOn(answers[${ts(rule.q)}]);
} else if (${rule.q}Confidence >= ${review}) {
  sendToReview(answers[${ts(rule.q)}]);
} else {
  escalateToHuman(answers[${ts(rule.q)}]);
}`)
        break
      }
      case 'noul': {
        const yes = constName(rule.q, 'YES')
        const no = constName(rule.q, 'NO')
        constants.push(`const ${yes} = ${rule.yes};`, `const ${no} = ${rule.no};`)
        branches.push(`// ${rule.q}
const ${rule.q}Value = answers[${ts(rule.q)}].noul;
if (${rule.q}Value >= ${yes}) onYes();
else if (${rule.q}Value <= ${no}) onNo();
else sendToReview(${rule.q}Value);`)
        break
      }
      case 'copy_if_p_gt': {
        const name = constName(rule.q, 'COPY')
        constants.push(`const ${name} = ${rule.threshold};`)
        branches.push(`// ${rule.q}: a runner-up with a real share still gets told
const { choice: chosen, probabilities } = answers[${ts(rule.q)}];
for (const [option, probability] of Object.entries(probabilities)) {
  if (option !== chosen && probability > ${name}) notify(option);
}`)
        break
      }
      case 'flag_if_score_gte': {
        const name = constName(rule.q, 'FLAG')
        constants.push(`const ${name} = ${rule.threshold};`)
        branches.push(`// ${rule.q}
if (answers[${ts(rule.q)}].score >= ${name}) ${rule.label.replace(/\W+/g, '')}();`)
        break
      }
      case 'grey_unless': {
        branches.push(`// ${rule.q} only matters when ${rule.dependsOn} is ${rule.equals.join(' or ')}
if (${ts(rule.equals)}.includes(answers[${ts(rule.dependsOn)}].choice)) {
  use(answers[${ts(rule.q)}]);
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

export { indent }
