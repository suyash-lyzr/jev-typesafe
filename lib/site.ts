/** One constant so the name can be swapped in minutes if legal asks. */
export const SITE = {
  name: 'Jev Lab',
  byline: 'by Lyzr',
  fullName: 'Jev Lab by Lyzr',
  tagline: "Jev doesn't write. It decides.",
  description:
    "An open playground and course for TypeSafe AI's Jev: send a state and typed questions, read the probabilities, turn them into policy.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  /** Printed next to latency so nobody reads it as TypeSafe's compute time. */
  region: process.env.NEXT_PUBLIC_SITE_REGION ?? 'iad1',
  provenance:
    'Numbers here are single runs (live) or recorded from docs.typesafe.ai with model id and date. They are not benchmarks.',
  links: {
    docs: 'https://docs.typesafe.ai',
    console: 'https://console.typesafe.ai',
    pythonSdk: 'https://docs.typesafe.ai/sdk/python',
    jsSdk: 'https://docs.typesafe.ai/sdk/javascript',
    jaggedness: 'https://docs.typesafe.ai/model-jaggedness/jev-1.13',
    lyzr: 'https://www.lyzr.ai',
    launchPost: 'https://typesafe.ai/blog/introducing-system-one-models-and-jev',
    homepage: 'https://typesafe.ai',
    communityBenchmark: 'https://github.com/souvikr/jev-test',
    /** Where drift reports go. Unset means the report links are hidden, not pointed at a guess. */
    issues: process.env.NEXT_PUBLIC_ISSUES_URL?.trim() || null,
  },
} as const
