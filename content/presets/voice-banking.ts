import type { Preset } from './types'

/**
 * One question, four utterances, and a threshold that is not one number.
 *
 * Built from docs.typesafe.ai/confidence, which makes the point this preset
 * exists to rehearse: the bar for acting is a property of the action, not of
 * the model. Showing a balance is recoverable, so 0.6 is plenty. Approving a
 * transfer moves money, so it wants 0.9 and a confirmation even then. Under
 * 0.5 nothing is acted on at all, because the model is reporting that it does
 * not know.
 *
 * Nothing here is recorded. The docs publish the routing code for this example
 * but no answers, and we would rather show an empty replay than a number we
 * made up. Press run and the four utterances fill in live.
 *
 * `mentions_amount` is ours, not the docs'. A Noul costs a few tokens and
 * tells the confirmation screen whether it has a figure to echo back, which is
 * the kind of question worth asking while you already have the model's
 * attention.
 */
export const voiceBanking: Preset = {
  slug: 'voice-banking',
  title: 'Voice banking intents',
  category: 'support',
  teaches: 'One intent question, two different bars to act on it.',
  patterns: ['intent routing', 'confidence routing', 'risk-scaled thresholds'],

  questions: {
    intent: {
      type: 'choice',
      instructions: 'What is the user trying to do?',
      criteria: {
        check_balance: 'View account balance',
        approve_transfer: 'Approve the pending withdrawal request',
        support: 'Get help with an issue',
        other: 'None of the above',
      },
    },
    mentions_amount: {
      type: 'noul',
      instructions: 'The user names a specific sum of money',
    },
  },

  policy: {
    rules: [
      // The docs gate one action at 0.9 and another at 0.6 off the same answer.
      // A band rule carries one pair, so this is the money bar: act at 0.9,
      // and the 0.5 floor below which everything goes to a person. Drag review
      // to 0.6 to see the read-only bar instead — the answer does not move.
      { q: 'intent', kind: 'band', act: 0.9, review: 0.5 },
      { q: 'mentions_amount', kind: 'noul', yes: 0.8, no: 0.2 },
    ],
  },

  variants: [
    {
      id: 'balance',
      label: 'Plain balance check',
      description:
        'The easy one. Expect a peak on check_balance, and note that it would clear the 0.6 read-only bar long before it cleared the 0.9 transfer bar.',
      state: "what's my balance",
      recorded: null,
    },
    {
      id: 'transfer',
      label: 'A transfer, stated plainly',
      description:
        'Clear intent and a clear figure. The interesting question is whether the confidence clears 0.9, because this is the branch where a wrong read moves money.',
      state: 'move two thousand from savings to checking',
      recorded: null,
    },
    {
      id: 'self-interrupted',
      label: 'Changes their mind mid-sentence',
      description:
        'Two intents in one breath, and the second one cancels the first. This is what a genuinely uncertain distribution is supposed to look like: spread, and therefore below the floor.',
      state: 'uh, transfer... actually wait, how much do I have first?',
      recorded: null,
    },
    {
      id: 'fraud',
      label: 'Something none of the options cover',
      description:
        'Not a balance, not a transfer, and arguably not ordinary support either. This is what the `other` option is for — without it the probability has nowhere honest to go.',
      state: 'I think someone used my card',
      recorded: null,
    },
  ],
}
