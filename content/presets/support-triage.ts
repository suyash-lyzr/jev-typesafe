import type { Preset } from './types'

/**
 * Five Choice questions in one request, verbatim from
 * docs.typesafe.ai/primitives/choice.
 *
 * The quickstart shows the contract; this shows the shape of real triage. Two
 * of the five questions are speculative — `return_reason` only matters when the
 * department is returns, `shipping_issue` only when it is shipping — so most
 * runs pay for answers the code throws away, and that is the intended trade.
 * One call is cheaper and faster than three, and the policy decides what to
 * read.
 *
 * The pair to compare is "clear" against "ambiguous". The same question set
 * lands on returns at confidence 1.0 for a ticket about one thing, and on
 * returns at 0.42 for a ticket about two. Nothing about the request changed.
 * The distribution is the model telling you the ticket belongs to two teams,
 * which is why the policy copies billing in at 0.35 rather than dropping it.
 */
export const supportTriage: Preset = {
  slug: 'support-triage',
  title: 'Support triage',
  category: 'support',
  teaches: 'Five Choice questions in one call, two of them speculative.',
  patterns: ['speculative fan-out', 'confidence routing', 'runner-up copy'],

  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      criteria: {
        returns: 'Exchanges, wrong or damaged items',
        shipping: 'Delivery status, delays, lost packages',
        billing: 'Charges, invoices, payment problems',
      },
    },
    return_reason: {
      type: 'choice',
      instructions: 'If the customer wants to return something, why?',
      criteria: {
        wrong_size: "The item doesn't fit",
        wrong_item: 'A different product was delivered',
        damaged: 'The item arrived broken or faulty',
        changed_mind: 'The item is fine, the customer no longer wants it',
        other: 'A return reason that fits none of the above',
      },
    },
    shipping_issue: {
      type: 'choice',
      instructions: 'If this is a shipping problem, which kind is it?',
      criteria: {
        not_delivered: 'The package never arrived',
        delayed: 'The package is late but still on its way',
        wrong_address: 'The package went to the wrong place',
        damaged_in_transit: 'The package arrived damaged',
        other: 'A shipping problem that fits none of the above',
      },
    },
    requested_resolution: {
      type: 'choice',
      instructions: 'What does the customer want to happen?',
      criteria: {
        exchange: 'Swap the item for a different one',
        refund: 'Money back',
        replacement: 'The same item sent again',
        information: 'Just an answer, no action needed',
      },
    },
    tone: {
      type: 'choice',
      instructions: "What is the customer's tone?",
      // The option names carry the whole meaning, so there is nothing to add.
      criteria: { calm: null, frustrated: null, angry: null },
    },
  },

  policy: {
    rules: [
      { q: 'department', kind: 'band', act: 0.85, review: 0.5 },
      // The docs' triage code copies in any other team holding more than 25%.
      { q: 'department', kind: 'copy_if_p_gt', threshold: 0.25 },
      // The docs treat this one as a straight yes/no: under 0.5, ask the
      // customer what they want instead of guessing. Act and review sit on the
      // same number so there is no middle band to hide in.
      { q: 'requested_resolution', kind: 'band', act: 0.5, review: 0.5 },
      { q: 'return_reason', kind: 'grey_unless', dependsOn: 'department', equals: ['returns'] },
      { q: 'shipping_issue', kind: 'grey_unless', dependsOn: 'department', equals: ['shipping'] },
    ],
  },

  variants: [
    {
      id: 'clear',
      label: 'One problem',
      description:
        'The docs’ wrong-size shoes ticket. One team, no ambiguity: returns at probability 1.0 and confidence 1.0.',
      state: 'My running shoes arrived in the wrong size. Can I swap them for a size 10?',
      recorded: {
        source: 'docs.typesafe.ai/primitives/choice',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          department: {
            type: 'choice',
            choice: 'returns',
            confidence: 1.0,
            probabilities: { shipping: 0.0, returns: 1.0, billing: 0.0 },
          },
        },
        usage: { input_tokens: 328, output_tokens: 34 },
        note: 'The docs ask only `department` against this ticket, so only that answer is recorded. Running the full five-question set here will return four more answers the docs never published, and the token counts will be higher than the 328 in / 34 out shown, which are for the one-question request.',
      },
    },
    {
      id: 'ambiguous',
      label: 'Two problems',
      description:
        'Wrong size and a double charge in the same message. Returns and billing both have a real claim on it, and the confidence says so.',
      state:
        "I ordered the trail runners in a 9 and they turned up as a 7, so they are no use to me. I have also been charged twice for the order — there are two identical amounts on my statement. It has been over a week now and nobody has come back to me. Can someone sort this out?",
      recorded: {
        source: 'docs.typesafe.ai/primitives/choice',
        model: 'jev-1.13.0',
        date: '2026-09-21',
        answers: {
          department: {
            type: 'choice',
            choice: 'returns',
            confidence: 0.42,
            probabilities: { shipping: 0.04, billing: 0.35, returns: 0.61 },
          },
          return_reason: {
            type: 'choice',
            choice: 'wrong_size',
            confidence: 1.0,
            probabilities: {
              other: 0.0,
              wrong_size: 1.0,
              changed_mind: 0.0,
              damaged: 0.0,
              wrong_item: 0.0,
            },
          },
          shipping_issue: {
            type: 'choice',
            choice: 'delayed',
            confidence: 0.67,
            probabilities: {
              wrong_address: 0.0,
              other: 0.26,
              not_delivered: 0.0,
              damaged_in_transit: 0.0,
              delayed: 0.74,
            },
          },
          requested_resolution: {
            type: 'choice',
            choice: 'refund',
            confidence: 0.2,
            probabilities: { replacement: 0.34, refund: 0.4, information: 0.02, exchange: 0.24 },
          },
          tone: {
            type: 'choice',
            choice: 'frustrated',
            confidence: 0.76,
            probabilities: { frustrated: 0.84, angry: 0.16, calm: 0.0 },
          },
        },
        usage: { input_tokens: 589, output_tokens: 212 },
        note: 'Read this one carefully. The docs describe their ambiguous ticket but never print it, so the message above is ours, written to the same brief: a wrong size, a double charge, a hint of delay, and no statement of what the customer wants. The recorded numbers are the docs’ numbers for the docs’ ticket, not for this text. Run it live and expect the same shape — department split between returns and billing, resolution near-flat — at different values.',
      },
    },
    {
      id: 'distracting',
      label: 'Buried in a record',
      description:
        'The same complaint, wrapped in the account record a CRM would actually hand you: loyalty tier, ten past orders, newsletter settings. Only two fields matter and the rest is noise.',
      state: {
        customer: {
          id: 'c_88214',
          name: 'R. Okafor',
          loyalty_tier: 'gold',
          member_since: '2021-03-14',
          lifetime_value_gbp: 2184.5,
          newsletter: {
            weekly_digest: true,
            product_launches: true,
            partner_offers: false,
            sms: false,
            preferred_language: 'en-GB',
          },
        },
        recent_orders: [
          { id: 'o_5512', date: '2024-11-02', items: 'Trail Runner 3, size 9', total_gbp: 118.0 },
          { id: 'o_5498', date: '2024-09-18', items: 'Merino socks x3', total_gbp: 27.0 },
          { id: 'o_5401', date: '2024-08-05', items: 'Rain shell, M', total_gbp: 96.0 },
          { id: 'o_5377', date: '2024-06-21', items: 'Trail Runner 2, size 9', total_gbp: 104.0 },
          { id: 'o_5290', date: '2024-05-09', items: 'Hydration vest', total_gbp: 72.0 },
          { id: 'o_5188', date: '2024-03-30', items: 'Gel insoles', total_gbp: 19.0 },
          { id: 'o_5102', date: '2024-02-11', items: 'Headtorch', total_gbp: 44.0 },
          { id: 'o_4996', date: '2023-12-28', items: 'Winter tights', total_gbp: 58.0 },
          { id: 'o_4871', date: '2023-11-15', items: 'Trail Runner 2, size 9', total_gbp: 104.0 },
          { id: 'o_4790', date: '2023-10-02', items: 'Running cap', total_gbp: 22.0 },
        ],
        open_ticket: {
          channel: 'email',
          received_at: '2024-11-12T09:41:00Z',
          subject: 'order o_5512',
          body: "I ordered the trail runners in a 9 and they turned up as a 7, so they are no use to me. I have also been charged twice for the order — there are two identical amounts on my statement. It has been over a week now and nobody has come back to me. Can someone sort this out?",
        },
      },
      recorded: null,
    },
    {
      id: 'angry',
      label: 'Same facts, hostile',
      description:
        'The wrong size, the double charge, the delay — all unchanged — written by someone who has run out of patience and is threatening a chargeback. Watch `tone` and `requested_resolution` move while `return_reason` does not.',
      state:
        "This is the third time I am writing and I am done being polite. You sent me a size 7 when I ordered a 9 — how is that even possible — and then you helped yourselves to the money TWICE. Two identical charges sitting on my statement for over a week while your support team says nothing. Fix this today or I ring my bank and raise a chargeback, and then I will tell everyone I know exactly how you operate.",
      recorded: null,
    },
  ],
}
