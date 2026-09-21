import type { Preset } from './types'

/**
 * The five bug reports from the Score page's own table, in one preset.
 *
 * This exists because "a score is a probability-weighted mean" is the single
 * sentence people get wrong about Score, and no amount of prose fixes it. The
 * five variants walk the same three levels from 0.0 to 2.0, and the two in the
 * middle — 1.11 and 1.43 — are the lesson: neither report sits *on* a level.
 * 1.43 is 0.57 on "workaround exists" plus 0.43 on "no workaround", and the
 * docs are explicit that it does not mean "43% of customers are blocked".
 *
 * The 1.0 row is the other half of the lesson. It comes from all the
 * probability sitting on level 1, but the identical score would come from an
 * even split across levels 0 and 2. Read `probabilities` and `confidence`
 * beside the score or you cannot tell those two cases apart.
 *
 * Numbers: docs.typesafe.ai/primitives/score, the "Reading a Score" table and
 * the response example above it. The report_quality levels come from the same
 * page's composite-scoring section; that section runs a longer version of the
 * spinner ticket, so its published 3.0 is not recorded against the short state
 * here and report_quality is left out of every recorded run.
 */
export const bugSeverity: Preset = {
  slug: 'bug-severity',
  title: 'Bug severity',
  category: 'scoring',
  teaches: 'A score is a probability-weighted mean of level numbers, not a rating out of two.',
  patterns: ['composite scoring'],

  questions: {
    bug_severity: {
      type: 'score',
      instructions: 'How severe is the reported issue?',
      criteria: [
        'Cosmetic; no impact to functionality',
        'Broken or degraded feature, but workaround exists',
        'Blocking issue; no workaround exists',
      ],
    },
    report_quality: {
      type: 'score',
      instructions: 'How much does the report give an engineer to work with?',
      criteria: [
        'No detail; just says something is broken',
        'Names the feature but no steps or environment',
        'Steps to reproduce or environment, but not both',
        'Steps to reproduce and environment',
      ],
    },
  },

  policy: {
    rules: [
      { q: 'bug_severity', kind: 'band', act: 0.85, review: 0.5 },
      { q: 'bug_severity', kind: 'flag_if_score_gte', threshold: 1.5, label: 'page the on-call engineer' },
      { q: 'report_quality', kind: 'band', act: 0.85, review: 0.5 },
    ],
  },

  variants: [
    {
      id: 'misaligned-button',
      label: '0.0 — misaligned button',
      description:
        'All the probability on level 0. Confidence 1.0 describes the shape of the answer, not a guarantee that it is right.',
      state: 'The export button is misaligned by a few pixels on the settings page.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/score#reading-a-score',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          bug_severity: {
            type: 'score',
            score: 0.0,
            confidence: 1.0,
            legend: {
              '0': 'Cosmetic; no impact to functionality',
              '1': 'Broken or degraded feature, but workaround exists',
              '2': 'Blocking issue; no workaround exists',
            },
            probabilities: { '0': 1.0, '1': 0.0, '2': 0.0 },
          },
        },
        note: 'The docs table publishes bug_severity only, so report_quality is unrecorded here and will fill in on a live run.',
      },
    },
    {
      id: 'pdf-export-dead',
      label: '1.0 — PDF export does nothing',
      description:
        'Exactly 1.0, because everything landed on level 1. An even split across levels 0 and 2 would print the same score, which is why the distribution is shown beside it.',
      state:
        'The PDF export button does nothing when clicked. I can still export to CSV and convert it myself, but that takes ages.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/score#reading-a-score',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          bug_severity: {
            type: 'score',
            score: 1.0,
            confidence: 1.0,
            legend: {
              '0': 'Cosmetic; no impact to functionality',
              '1': 'Broken or degraded feature, but workaround exists',
              '2': 'Blocking issue; no workaround exists',
            },
            probabilities: { '0': 0.0, '1': 1.0, '2': 0.0 },
          },
        },
        note: 'The docs table publishes bug_severity only; report_quality is unrecorded.',
      },
    },
    {
      id: 'spinner',
      label: '1.11 — spinner never finishes',
      description:
        'Mostly level 1 with a little on level 2: 1 × 0.89 + 2 × 0.11 = 1.11. Some of the team have a workaround and some do not, and the split in the report shows up as a split in the distribution.',
      state:
        'Export to PDF fails with a spinner that never finishes. Some of our team say CSV export still works for them, others say it fails too.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/score#reading-a-score',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          bug_severity: {
            type: 'score',
            score: 1.11,
            confidence: 0.84,
            legend: {
              '0': 'Cosmetic; no impact to functionality',
              '1': 'Broken or degraded feature, but workaround exists',
              '2': 'Blocking issue; no workaround exists',
            },
            probabilities: { '0': 0.0, '1': 0.89, '2': 0.11 },
          },
        },
        note: 'The composite-scoring section of the same page scores report_quality 3.0 at confidence 1.0, but on a longer version of this ticket, so it is not recorded against this state.',
      },
    },
    {
      id: 'safari-crash',
      label: '1.43 — Safari crash',
      description:
        'The request from the top of the Score page: 1 × 0.57 + 2 × 0.43 = 1.43, confidence 0.35 because the model is genuinely split. Chrome is a workaround for most customers and not for the Safari-only ones.',
      state:
        'The export button crashes the settings page in Safari. It works in Chrome, but a few of our customers only use Safari.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/score#response-structure',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          bug_severity: {
            type: 'score',
            score: 1.43,
            confidence: 0.35,
            legend: {
              '0': 'Cosmetic; no impact to functionality',
              '1': 'Broken or degraded feature, but workaround exists',
              '2': 'Blocking issue; no workaround exists',
            },
            probabilities: { '0': 0.0, '1': 0.57, '2': 0.43 },
          },
        },
        usage: { input_tokens: 332, output_tokens: 18 },
        note: 'Adding an examples array that matches this report ("export fails in one browser but works in another") moves the same ticket to 1.03 at confidence 0.96; an unrelated example leaves it at 1.43 / 0.35. Higher confidence does not establish which answer is right.',
      },
    },
    {
      id: 'nobody-can-log-in',
      label: '2.0 — nobody can log in',
      description: 'The top of the scale, with all the probability on level 2 and nothing to interpolate.',
      state: 'Nobody on our team can log in since this morning. We get a 500 error on every attempt.',
      recorded: {
        source: 'docs.typesafe.ai/primitives/score#reading-a-score',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          bug_severity: {
            type: 'score',
            score: 2.0,
            confidence: 1.0,
            legend: {
              '0': 'Cosmetic; no impact to functionality',
              '1': 'Broken or degraded feature, but workaround exists',
              '2': 'Blocking issue; no workaround exists',
            },
            probabilities: { '0': 0.0, '1': 0.0, '2': 1.0 },
          },
        },
        note: 'The docs table publishes bug_severity only; report_quality is unrecorded.',
      },
    },
  ],
}
