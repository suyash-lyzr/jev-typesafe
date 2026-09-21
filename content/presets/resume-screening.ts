import type { Preset } from './types'

/**
 * Four resumes, one Noul and one Score asked about the same thing.
 *
 * This preset exists to kill the idea that a Noul is a 0-to-1 rating. It is
 * not: it is the probability that one proposition is true. The Noul docs make
 * the point with these four candidates, and the numbers are the argument.
 * "Used Python occasionally for small scripts" gets 0.14 on "Is the candidate
 * strong in Python?" — not because the candidate is 14% skilled, but because
 * the model thinks "strong" is probably false. The Score put the same resume
 * on level 1, "Some familiarity", a level somebody actually wrote down.
 *
 * So a Noul near 0.5 does not mean "medium". It means the model is split on a
 * yes/no question. If you want degree, write the degrees out as levels and use
 * a Score; then every answer lands on or near a description you chose, and you
 * can argue with the wording when you disagree.
 *
 * The third Noul is the control. "Does the resume state that the candidate
 * has used Python at work?" — the docs' own suggested rewording — has a crisp boundary, which is what the
 * docs mean by making the yes/no line unambiguous — and it is the question a
 * Noul is actually for.
 *
 * Numbers: docs.typesafe.ai/primitives/noul, the four-candidate table under
 * "Reading a Noul". That table publishes the Noul values and the Score values
 * but not the Score's distribution or confidence, so only the Nouls are
 * recorded below; each run's note carries the published score verbatim.
 *
 * The state is exactly the docs' candidate sentence, as a plain string, so the
 * recorded Noul values belong to the request this preset actually sends.
 */
export const resumeScreening: Preset = {
  slug: 'resume-screening',
  title: 'Resume screening',
  category: 'scoring',
  teaches: 'A Noul is the probability of a yes, not a score out of one. 0.5 is not "medium".',
  patterns: ['composite scoring'],

  questions: {
    python_experience: {
      type: 'score',
      instructions: 'How much Python experience does the candidate have?',
      criteria: ['No experience', 'Some familiarity', 'Regular use in a job', 'Deep expertise'],
    },
    python_strong: {
      type: 'noul',
      instructions: 'Is the candidate strong in Python?',
    },
    used_python_at_work: {
      type: 'noul',
      instructions: 'Does the resume state that the candidate has used Python at work?',
      criteria: {
        true: 'It names a job, role or project where Python was used',
        false: 'Python is only mentioned outside work, or not mentioned at all',
      },
    },
  },

  policy: {
    rules: [
      { q: 'python_experience', kind: 'band', act: 0.85, review: 0.5 },
      { q: 'python_strong', kind: 'noul', yes: 0.8, no: 0.2 },
      { q: 'used_python_at_work', kind: 'noul', yes: 0.8, no: 0.2 },
    ],
  },

  variants: [
    {
      id: 'java-and-go',
      label: 'Noul 0.03 · Score 0.0',
      description:
        'A clear no on both readings. The candidate says outright that they have not used Python, so the proposition is false and the Score lands on level 0.',
      state: 'My experience is in Java and Go. I have not used Python.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/noul#reading-a-noul',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          python_strong: { type: 'noul', noul: 0.03 },
        },
        note: 'The docs table gives python_experience as 0.0 (No experience) for this excerpt, but publishes no distribution or confidence for it, so the Score is left unrecorded rather than reconstructed. used_python_at_work is not in the docs and is left for a live run.',
      },
    },
    {
      id: 'occasional-scripts',
      label: 'Noul 0.14 · Score 1.0',
      description:
        'The one that makes the point. 0.14 is not "a bit of Python" — it is the model saying "strong" is probably false. The Score says the same resume is level 1, "Some familiarity", which is the reading a human would want.',
      state: 'I have used Python occasionally for small scripts alongside my main Java work.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/noul#reading-a-noul',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          python_strong: { type: 'noul', noul: 0.14 },
        },
        note: 'The docs table gives python_experience as 1.0 (Some familiarity) for this excerpt; no distribution or confidence is published, so the Score is unrecorded.',
      },
    },
    {
      id: 'two-years-daily',
      label: 'Noul 0.81 · Score 2.05',
      description:
        'A probable yes at 0.81, and a Score just past level 2, "Regular use in a job". Note that the gap from the previous candidate is 0.67 on the Noul and about one level on the Score: the spacing between Noul values is not something you chose.',
      state: 'I used Python every day for two years in my last job, mostly data pipelines.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/noul#reading-a-noul',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          python_strong: { type: 'noul', noul: 0.81 },
        },
        note: 'The docs table gives python_experience as 2.05 (Regular use in a job); the published table does not give the distribution or confidence behind it, so the Score is unrecorded.',
      },
    },
    {
      id: 'eight-years-django',
      label: 'Noul 0.92 · Score 2.89',
      description:
        'A strong yes. 0.92 is a probability, not a mark out of one hundred — the candidate with 0.81 is not "11% less skilled", the model is just less sure the word "strong" applies.',
      state: 'I have written Python daily for eight years, including maintaining a large Django codebase.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/noul#reading-a-noul',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          python_strong: { type: 'noul', noul: 0.92 },
        },
        note: 'The docs table gives python_experience as 2.89 (Deep expertise); no distribution or confidence is published, so the Score is unrecorded.',
      },
    },
  ],
}
