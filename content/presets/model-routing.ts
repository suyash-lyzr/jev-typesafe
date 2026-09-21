import type { Preset } from './types'

/**
 * Two questions decide which handler pays for the rest of the work.
 *
 * The intent-routing pattern puts a cheap classifier in front of everything
 * expensive. One intent goes to a database lookup with no model involved; two
 * go to specialist LLMs loaded with different context; one goes to a human
 * when it is too hard to automate. The classifier runs on every message, the
 * expensive handlers run only on the messages that need them.
 *
 * What makes it work is that the routing lives in code, not in the model. The
 * docs' own `route_ticket` reads two thresholds: an intent below confidence
 * 0.5 goes to a person regardless of which intent won, and a complaint with
 * complexity above 1 — or complexity confidence below 0.5 — goes to a person
 * too. Both are in the policy below, so you can drag them and re-decide every
 * variant without another API call.
 *
 * `wants_human` is ours rather than the docs': a customer who asks for a
 * person should get one whatever the classifier thinks, and it costs a few
 * tokens on a request that is already being made.
 *
 * The pattern page publishes the routing code but no probabilities, so every
 * variant is recorded null.
 *
 * Source: docs.typesafe.ai/patterns/intent-routing.
 */
export const modelRouting: Preset = {
  slug: 'model-routing',
  title: 'Model routing',
  category: 'support',
  teaches: 'Classify once, then let thresholds in your code choose the handler.',
  patterns: ['intent routing', 'confidence routing'],

  questions: {
    intent: {
      type: 'choice',
      instructions: 'What is the customer asking about?',
      criteria: {
        order_status: 'Where an order is, when it will arrive, or whether it shipped',
        product_question: 'A question about what a product is, does, or fits',
        return_exchange: 'Sending something back, swapping it, or asking how to',
        complaint: 'Dissatisfaction with an order, a product or the service itself',
        other: 'Anything that fits none of the above',
      },
    },
    complexity: {
      type: 'score',
      instructions: 'How much work does resolving this message take?',
      criteria: [
        'Answerable by a lookup',
        'Needs judgment or a few exchanges',
        'Needs an exception or a human decision',
      ],
    },
    wants_human: {
      type: 'noul',
      instructions: 'Is the customer asking to speak to a person?',
    },
  },

  policy: {
    rules: [
      // The docs' first gate: below 0.5 on intent, nobody is routed automatically.
      { q: 'intent', kind: 'band', act: 0.5, review: 0.5 },
      { q: 'complexity', kind: 'band', act: 0.5, review: 0.5 },
      // The complaint gate: a complexity above 1 is too much to automate safely.
      { q: 'complexity', kind: 'flag_if_score_gte', threshold: 1.01, label: 'route to a human agent' },
      { q: 'wants_human', kind: 'noul', yes: 0.8, no: 0.2 },
    ],
  },

  variants: [
    {
      id: 'late-order-complaint',
      label: 'Complaint about a late order',
      description:
        'The case the routing code spends most of its lines on. It is a complaint and it is also an order-status question, so intent confidence is the thing to watch: split probability here is the model telling you it is both, and the policy sends it to a person rather than to the wrong specialist.',
      state:
        "This is the second time an order has turned up a week late, and nobody told me it was delayed. I'd like to know what you're going to do about it.",
      recorded: null,
    },
    {
      id: 'product-fit',
      label: 'Does it fit?',
      description:
        'A product question with no grievance attached. Low complexity, high intent confidence: this is the path to a specialist LLM, which is the expensive handler being used on purpose rather than by default.',
      state:
        'I have the 13-inch model from two years ago — will the new keyboard case fit it, or is it only for the current size?',
      recorded: null,
    },
    {
      id: 'order-lookup',
      label: 'Where is order A-2231?',
      description:
        'The cheapest possible outcome. One intent, a lookup, and no model after the classifier — which is the point of routing at all.',
      state: 'Where is order A-2231?',
      recorded: null,
    },
  ],
}
