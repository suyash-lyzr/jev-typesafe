import type { Preset } from './types'

/**
 * Eight questions in one request, most of which will not matter.
 *
 * The smart-home demo is the clearest statement of speculative fan-out in the
 * docs: ask "what action should be taken on the lights?" before you know the
 * request is about lights at all, and throw the answer away in code when it
 * turns out to be about the back door. The alternative — a call to find the
 * category, then a call to find the device, then a call to find the action —
 * is three round trips to learn what one round trip already knew.
 *
 * The demo page describes its questions in prose and publishes no request or
 * numbers, so these eight questions are modelled on it, not copied from it, and
 * nothing here is recorded.
 *
 * The policy is the other half. Every irrelevant answer is still an answer,
 * with a probability attached, so the grey_unless rules below say which ones
 * your code is allowed to read on this path. Switch variants and watch which
 * questions grey out: that is the fan-out being filtered, in code, for free.
 *
 * The two Nouls are the seam with a generative model. `is_compound` decides
 * whether an LLM is asked to split the request into atomic commands; needs_llm
 * decides whether the whole thing falls through to a conversational model. The
 * demo page publishes no probabilities, so every variant here is recorded null
 * — the numbers you see are the ones you produce.
 *
 * Source: docs.typesafe.ai/demos/smart-home, with the pattern itself at
 * docs.typesafe.ai/patterns/fan-out.
 */
export const smartHome: Preset = {
  slug: 'smart-home',
  title: 'Smart home assistant',
  category: 'support',
  teaches: 'Ask every question up front, including the ones that will not apply, and filter in code.',
  patterns: ['speculative fan-out', 'intent routing'],

  questions: {
    category: {
      type: 'choice',
      instructions: 'What category of request is this?',
      criteria: {
        smarthome_command: 'An instruction to control a device in the home',
        information_request: 'A question about the world, such as weather, news or facts',
        conversation: 'Chat or small talk with no task attached',
        other: 'Anything that fits none of the above',
      },
    },
    room: {
      type: 'choice',
      instructions: 'Which room or area is this request targeting?',
      criteria: {
        kitchen: null,
        living_room: null,
        bedroom: null,
        bathroom: null,
        whole_house: 'The request covers the whole home, e.g. "all the lights in the house"',
        none_stated: 'No room or area is named',
      },
    },
    device: {
      type: 'choice',
      instructions: 'What type of device is this request targeting?',
      criteria: {
        lights: null,
        thermostat: null,
        lock: null,
        speaker: null,
        blinds: null,
        none: 'No device is targeted, or the request is not a device command',
      },
    },
    light_action: {
      type: 'choice',
      instructions: 'If this request targets lights, what action should be taken on them?',
      criteria: {
        turn_on: null,
        turn_off: null,
        set_level: 'Set the brightness to a particular level rather than simply on or off',
        none: 'The request does not ask for an action on lights',
      },
    },
    lock_action: {
      type: 'choice',
      instructions: 'If this request targets a lock, what action should be taken on it?',
      criteria: {
        lock: null,
        unlock: null,
        none: 'The request does not ask for an action on a lock',
      },
    },
    level: {
      type: 'choice',
      instructions: 'If the request names a level or intensity, which bucket does it fall in?',
      criteria: {
        off: null,
        low: 'Around a quarter or less',
        medium: 'Around half',
        high: 'Around three quarters',
        full: 'All the way up',
        none_stated: 'No level is named',
      },
    },
    is_compound: {
      type: 'noul',
      instructions: 'Does the request ask for more than one distinct action?',
    },
    needs_llm: {
      type: 'noul',
      instructions:
        'Does answering this request require generating free-form text rather than operating a device?',
    },
  },

  policy: {
    rules: [
      { q: 'category', kind: 'band', act: 0.7, review: 0.4 },
      { q: 'room', kind: 'grey_unless', dependsOn: 'category', equals: ['smarthome_command'] },
      { q: 'device', kind: 'grey_unless', dependsOn: 'category', equals: ['smarthome_command'] },
      { q: 'light_action', kind: 'grey_unless', dependsOn: 'device', equals: ['lights'] },
      { q: 'lock_action', kind: 'grey_unless', dependsOn: 'device', equals: ['lock'] },
      { q: 'level', kind: 'grey_unless', dependsOn: 'light_action', equals: ['set_level'] },
      { q: 'is_compound', kind: 'noul', yes: 0.8, no: 0.2 },
      { q: 'needs_llm', kind: 'noul', yes: 0.8, no: 0.2 },
    ],
  },

  variants: [
    {
      id: 'lights-off-house',
      label: 'All the lights',
      description:
        'The docs\' own worked example. Four answers matter — category, room, device, light_action — and the other four are speculation the code discards.',
      state: 'Turn off all of the lights in the house',
      recorded: null,
    },
    {
      id: 'compound',
      label: 'Two commands in one',
      description:
        'Lights and a lock in one sentence. One device answer cannot hold both, which is what is_compound is for: a yes sends the text to an LLM to be split, and each half comes back through the same eight questions.',
      state: 'Turn off the kitchen lights and lock the back door',
      recorded: null,
    },
    {
      id: 'dim-to-thirty',
      label: 'Set a level',
      description:
        'The only variant where `level` is worth reading. "Thirty percent" is a number, so the buckets do the rounding rather than asking the model for arithmetic it is bad at.',
      state: 'Dim the kitchen lights to thirty percent',
      recorded: null,
    },
    {
      id: 'weather',
      label: 'Not a command at all',
      description:
        'Nothing in the home is being operated, so every device question should grey out and needs_llm should carry the decision to hand the request to a conversational model.',
      state: "What's the weather going to be like tomorrow?",
      recorded: null,
    },
  ],
}
