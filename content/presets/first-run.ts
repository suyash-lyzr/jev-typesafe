import type { Preset } from './types'

/**
 * The quickstart request, verbatim from docs.typesafe.ai/introduction/quickstart.
 *
 * It is the landing page's replay and the first thing most readers run, so the
 * recorded numbers are the docs' own — and the live answer will differ slightly,
 * which is the point: aliases move and calibration is a property of many
 * answers, not of this one.
 */
export const firstRun: Preset = {
  slug: 'first-run',
  title: 'First run',
  category: 'support',
  teaches: 'The whole contract in one click: three question types, one request.',
  patterns: ['speculative fan-out'],

  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle this',
      criteria: {
        billing: 'Payment or subscription issues',
        technical: 'Bugs or integration problems',
        sales: 'Pricing or account questions',
      },
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated the customer appears',
      criteria: ['Calm, just stating facts', 'Frustrated but civil', 'Very angry, strong language'],
    },
    is_urgent: {
      type: 'noul',
      instructions: 'The message conveys urgency or time-sensitivity',
    },
  },

  variants: [
    {
      id: 'stripe',
      label: 'Stripe integration',
      description: 'The quickstart ticket: urgent, technical, civil.',
      state:
        "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
      recorded: {
        source: 'docs.typesafe.ai/introduction/quickstart',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          department: {
            type: 'choice',
            choice: 'technical',
            confidence: 0.78,
            probabilities: { technical: 0.85, sales: 0.0, billing: 0.15 },
          },
          frustration: {
            type: 'score',
            score: 1.0,
            confidence: 1.0,
            legend: {
              '0': 'Calm, just stating facts',
              '1': 'Frustrated but civil',
              '2': 'Very angry, strong language',
            },
            probabilities: { '0': 0.0, '1': 1.0, '2': 0.0 },
          },
          is_urgent: { type: 'noul', noul: 1.0 },
        },
        usage: { input_tokens: 392, output_tokens: 65 },
        note: 'A live run of the same request on 2026-09-21 returned technical 0.82 at confidence 0.73 and is_urgent 0.99. Close, not identical — which is what "calibrated across many answers" means.',
      },
    },
    {
      id: 'resolved',
      label: 'Already fixed',
      description: 'The same three questions against a message that needs nothing.',
      state: 'Thanks, that fixed it!',
      recorded: null,
    },
  ],
}
