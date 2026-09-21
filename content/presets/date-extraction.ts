import type { Question } from '@/lib/schema'
import type { Preset } from './types'

/**
 * Seven Choice questions that read a date off the page, and no arithmetic.
 *
 * Jev reads dates as text, not as ordered quantities, so the date-extraction
 * cookbook never asks it for a date. It asks which shape the date is written
 * in and which parts the text names — month, day, year, or a weekday and which
 * week — and code turns those answers into a real date. Every part of a date
 * is a small closed set, which is what makes each one a Choice rather than
 * free-form parsing, and each one gets a `none` escape so a missing part is
 * reported rather than guessed.
 *
 * The escapes are the whole trick. `none` on `mode` means the document never
 * states this date; `none` on `year` means no year was written and code fills
 * one in; `out_of_range` means a year was stated that the list does not cover,
 * so code flags it instead of picking the nearest thing. A model that can only
 * answer with the options you wrote cannot invent a date.
 *
 * TODAY is pinned to 2026-07-30, a Thursday, exactly as the cookbook pins it,
 * so "next Thursday" resolves to 2026-08-06 on every run. The resolution
 * happens in your code, not here: this preset is the reading half.
 *
 * On recording: the cookbook publishes the assembled dates and each date's
 * confidence — which is the *lowest* confidence among the parts that date used,
 * not any single answer — and never prints the per-question distributions. A
 * RecordedRun needs a full answer per question, so every variant here is
 * recorded null and the published results live in the descriptions instead.
 * The cookbook ran on jev-1.12.
 *
 * Source: docs.typesafe.ai/cookbooks/date_extraction_cookbook.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * The cookbook lists one option per year from 1900 to 2050, which is 151
 * options — well inside the 255-option cap, and completely unreadable in a
 * playground. A narrow window teaches the same thing: a stated year that falls
 * outside it comes back as `out_of_range` rather than as a wrong year, which is
 * the behaviour worth seeing. Widen it in the editor if you want the real one.
 */
const YEAR_WINDOW = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

const ABSENT = 'The document does not state this, or it is not this kind of date.'

function optionsFrom(values: readonly (string | number)[], absent: string): Record<string, unknown> {
  const criteria: Record<string, unknown> = {}
  for (const value of values) criteria[String(value)] = null
  criteria.none = absent
  return criteria
}

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1)

/** The cookbook's seven questions, with the phrase naming which date you want. */
export function dateQuestions(role: string): Record<string, Question> {
  return {
    mode: {
      type: 'choice',
      instructions:
        `How is ${role} written? 'absolute' = a calendar date naming a month (e.g. 'August 14', ` +
        `'the 3rd of March'); 'relative' = given relative to today (today, tomorrow, the day after ` +
        `tomorrow, or a named weekday such as 'next Thursday'); 'none' = the document does not ` +
        `state this date.`,
      criteria: { absolute: null, relative: null, none: null },
    },
    month: {
      type: 'choice',
      instructions: `If ${role} is an absolute calendar date, which month is it in?`,
      criteria: optionsFrom(MONTHS, ABSENT),
    },
    day: {
      type: 'choice',
      instructions: `If ${role} is an absolute calendar date, which day of the month (1-31)?`,
      criteria: optionsFrom(DAYS_OF_MONTH, ABSENT),
    },
    year: {
      type: 'choice',
      instructions:
        `If ${role} is an absolute calendar date, which year? Pick 'none' if the document states ` +
        `no year (code infers it), or 'out_of_range' if a year is stated but not in the list.`,
      criteria: {
        ...optionsFrom(YEAR_WINDOW, 'No year is stated for this date.'),
        out_of_range: 'A year is stated for this date but is outside the listed range.',
      },
    },
    day_anchor: {
      type: 'choice',
      instructions:
        `If ${role} is relative to today, which day is it? 'today', 'tomorrow', 'day_after' (the ` +
        `day after tomorrow), or 'weekday' (a named day of the week).`,
      criteria: {
        today: null,
        tomorrow: null,
        day_after: null,
        weekday: null,
        none: ABSENT,
      },
    },
    weekday: {
      type: 'choice',
      instructions: `If ${role} names a day of the week, which one?`,
      criteria: optionsFrom(WEEKDAYS, ABSENT),
    },
    week_offset: {
      type: 'choice',
      instructions:
        `If ${role} names a weekday, which week is it in? 'next' for 'next Thursday' or 'Thursday ` +
        `next week'; 'current' for 'this Thursday'; 'none' for a bare weekday with no qualifier ` +
        `(just 'Thursday' / 'on Thursday').`,
      criteria: { current: null, next: null, none: ABSENT },
    },
  }
}

export const dateExtraction: Preset = {
  slug: 'date-extraction',
  title: 'Date extraction',
  category: 'extraction',
  teaches: 'Read the parts of a date as Choices; do the calendar arithmetic in code.',
  patterns: ['speculative fan-out', 'confidence routing'],

  questions: dateQuestions('the date of the design review'),

  policy: {
    rules: [
      { q: 'mode', kind: 'band', act: 0.6, review: 0.6 },
      { q: 'month', kind: 'grey_unless', dependsOn: 'mode', equals: ['absolute'] },
      { q: 'day', kind: 'grey_unless', dependsOn: 'mode', equals: ['absolute'] },
      { q: 'year', kind: 'grey_unless', dependsOn: 'mode', equals: ['absolute'] },
      { q: 'day_anchor', kind: 'grey_unless', dependsOn: 'mode', equals: ['relative'] },
      { q: 'weekday', kind: 'grey_unless', dependsOn: 'day_anchor', equals: ['weekday'] },
      { q: 'week_offset', kind: 'grey_unless', dependsOn: 'day_anchor', equals: ['weekday'] },
    ],
  },

  variants: [
    {
      id: 'next-thursday',
      label: 'Relative — "next Thursday"',
      description:
        'The message behind the cookbook\'s playground link. Nothing here names a month, so mode should read relative, day_anchor weekday, and the week_offset answer decides which Thursday. With TODAY pinned to 2026-07-30 the cookbook resolves this to 2026-08-06 at confidence 0.92.',
      state: "Let's schedule the design review for next Thursday.",
      recorded: null,
    },
    {
      id: 'form-deadline',
      label: 'Absolute — no year stated',
      description:
        'August 14 with no year. `year` should come back none, and code fills in the current year, moving to the next only when the date is already more than a month past. The cookbook resolves this to 2026-08-14 at confidence 0.95.',
      state: 'Please return the signed form by August 14.',
      questions: dateQuestions('the deadline to return the form'),
      recorded: null,
    },
    {
      id: 'contract-two-dates',
      label: 'Two dates, one asked for',
      description:
        'The state states two dates and the role phrase picks between them: this run asks for the effective date, 2025-01-01, not the expiry. Change "takes effect" to "expires" in the instructions and the same seven questions read 2027-12-31 instead — the cookbook gets 0.97 and 0.91 respectively.',
      state: 'This agreement is effective January 1, 2025 and expires December 31, 2027.',
      questions: dateQuestions('the date the agreement takes effect'),
      recorded: null,
    },
    {
      id: 'never-mentioned',
      label: 'The date that is not there',
      description:
        'The form mentions a date, just not this one. The cookbook records mode coming back absolute with no month to go with it, which code reports as "absolute date incomplete" at confidence 0.46 — under the 0.60 gate, so it goes to a person rather than out as a guess.',
      state: 'Please return the signed form by August 14.',
      questions: dateQuestions('the date of the kickoff call'),
      recorded: null,
    },
  ],
}
