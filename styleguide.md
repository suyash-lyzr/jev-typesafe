# Styleguide

## Current UI direction

Last updated: 2026-09-22

### Summary

**Quiet Signal, warm monochrome.** Jev Lab should feel like a calm, well-made instrument:
- Stone-white paper and near-black ink, with no brand hue. Warmth (hue 30–40) keeps the
  neutrals from feeling clinical.
- Soft card shadows, so the page reads as layered paper.
- Small letter-spaced labels.
- Numbers that carry the page.

The only colour is pastel and muted:
- the three question types: slate-blue Choice, sage Noul, clay Score
- the five category tints

These label things. They never compete for a click. Actions, selection, bars and focus are
all ink: black in light mode, greyish white in dark mode.

The one statement surface is the policy card. It inverts: an ink card in light mode, an
off-white card in dark mode. It borrows the *idea* of a single loud card from DAIR's
tutorial, not its colour.

History:
- Cloud White and blue came first. The user then asked for pastels, and then for black and
  grey instead of blue: "classy, neat, clean".
- A lime-and-black copy of DAIR was rejected, and so was type that was too large.

Avoid:
- blue, or any saturated accent
- a second action colour
- paragraphs where a label would do
- display type above 22px outside the homepage hero
- copying a reference's visual identity

### Pastel rule

Accent hues are low in saturation and never neon. In light mode they are dusty mid-tones on
soft tints, dark enough to read. In dark mode they are light pastels on low-light washes. A
new accent goes in `globals.css` as a token, in both themes.

### Palette (light · dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | stone white `hsl(40 14% 97.6%)` | warm charcoal `hsl(30 6% 6.5%)` | page canvas |
| `--card` | white | `hsl(30 5% 9.5%)` | cards, rows, inputs |
| `--foreground` / `--primary` / `--brand` / `--fill` | ink `hsl(30 8% 9%)` | greyish white `hsl(40 14% 91%)` | text, primary buttons, links, selection, the top bar, step circles |
| `--muted-foreground` / `--faint` | 34% / 48% | 68% / 53% | secondary text, captions |
| `--border` | `hsl(40 8% 88.5%)` | `hsl(30 5% 16.5%)` | hairlines |
| `--results` / `--sidebar` | `hsl(40 13% 96.2%)` | `hsl(30 6% 8%)` | the results pane tone |
| `--type-*` | slate-blue, sage, clay on pale tints | light pastels on 13% washes | question-type badges and accents |
| `--cat-*` | dusty blue, apricot, lavender, sage, rose | light pastels | category icons |

`.shadow-card` is the neo-pop card (see below). `.shadow-float` is for the homepage console,
popovers and the policy card.

### Dark mode

A light/system/dark switch sits in the top bar (a three-icon pill; the active icon is solid ink).
The choice is stored in `jevlab.theme.v1`, and an inline script in `<head>` applies the `dark`
class before first paint, so nothing flashes. With no stored choice it follows the system,
including live changes.

The dark palette is warm charcoal:
- The canvas is warm charcoal, never pure black. Cards are one step lighter, and the results
  pane sits in between.
- Text is greyish white, with the same three-step text scale.
- Ink roles flip: primary buttons, bars and step circles become greyish white with dark
  text. The policy card becomes an off-white statement card.
- Type and category hues become light pastels on low washes.
- Shadows become a hairline ring plus a deep drop.
- Theme switches cross-fade over 240ms (not under reduced motion).

Tokens only: nothing in a component should name a raw colour, so both themes come free.

### Typography

- **Space Grotesk 500/600:**
  - h1–h3.
  - The homepage hero at 54px (42px on mobile). This is the only large type.
  - Answer headlines at 22px.
  - Numbers, as `.num`.
- **DM Sans 400/500:**
  - 14px for inputs, question text and state.
  - 13–13.5px for UI.
  - 17px for the homepage lede.
- **JetBrains Mono:**
  - ids and JSON
  - the model id, tokens and cost
  - section labels outside the playground steps: 11px uppercase, `--faint`
- **Playground steps** (1 Use case, 2 Edit the state, 3 Ask typed questions, 4 Read the
  decisions): Space Grotesk 14px semibold in `--foreground`, after a 20px blue circle with the
  number in white (`StepLabel` / `StepNumber`).

### Layout

- **Home:** the split screen. The left side has an eyebrow pill, the h1 (with its second line
  in `--faint`), the lede, two buttons, and a dashed-rule facts row. The right side is the
  light console: it types a use case's state, lands its answers as capsule rows, and has
  "Another example", "Edit" and "Run it live". Three link tiles sit below.
- **Playground:** an app bar and two panes. No sidebars and no side sheets.
  - App bar (white): "Playground", then "1 · USE CASE" and the use-case picker button (category
    icon, title, chevron). It opens a panel below it, not a side sheet. The panel holds a search
    box, then category filter chips that wrap (All, TypeSafe's five use-case-map categories, and
    "From the docs"; the active chip is solid ink), then a 3-column grid of use-case cards grouped
    by category. Its footer has "Start from a blank request" and "Browse all →". Recent is a
    dropdown on the right, next to Share and Reset.
  - Left, on the pane tone (`--sidebar`), mirroring the right. First comes the use case's
    category, industry and shape pills and its description in 14px text, with no box. Then
    two white panels (`Panel` in editor-pane):
    - **2 · Edit the state:** the textarea sits borderless inside the panel, and the panel's
      border darkens on focus. The Text/JSON switch is in the header. The footer holds the
      note and the token count.
    - **3 · Ask typed questions:** one divided list, not stacked boxes. Each row has the
      badge in a fixed 68px column, so questions align. The question is 14px medium; below it
      are the mono id and what the answer will be ("Picks one of 4 options", "Probability of
      yes", "A point on 3 levels"). That replaces the type legend. An open row gets a muted
      wash and a type-coloured left edge. The footer holds "Add question" and "Edit as JSON".
    - The Run bar is pinned to the bottom of the pane.
  - Right, on `--results` (a light blue-grey): "4 · Read the decisions", with the "Compare with an
    LLM" toggle pill at its top right (brand-soft when on). Then the tabs, then one white card per
    answer, then the policy card. The Run bar is one row: the model select, then the Run button (which adds "+ LLM" when compare is on).
- **Mobile:** the same picker panel, full width. Edit and Results are separate views.

### Components

- **Type badge:** 22px tall; mono uppercase text on the type's soft tint, with a 25% border
  in the same hue: CHOICE blue, NOUL green, SCORE amber. It appears on every question,
  answer, capsule row and example card.
- **Picker card:** the title at 13px and "industry · shape" at 11.5px in `--faint`. 10px radius,
  with a hairline border. Selected: brand-soft fill, `brand/50` border and a brand-text title.
- **Expanded question:** a small document, not a form.
  - Inputs have no box at rest. They show a muted wash on hover, and a white field with a
    ring while editing (`BARE` in editor-pane).
  - A 3px left edge in the question type's colour.
  - The header holds the badge, then the id as editable mono text, then "A/B test",
    duplicate, more and collapse.
  - Then the question at 15px medium.
  - Choice options are dashed-rule rows: the key in mono, in the Choice colour, then the
    description in plain text.
  - Score levels are dashed-rule rows. Each starts with a small rising "signal" meter (one
    bar per level, filled up to this one), then the level number, with "lowest" and
    "highest" under the end rows.
  - Noul criteria are YES and NO rows.
  - Row actions (move, delete) appear only on hover or focus. "Add …" actions are blue text
    buttons.
- **Category icon:** a rounded tile in the category's hue at 12% opacity, with the Lucide icon
  from the docs: blocks, zap, database-zap, badge-check or wrench.
- **Decision card:** 14px radius, `px-4 py-3.5`.
  - The header holds the badge, the mono id, and "confidence NN%" on the right (not for a
    Noul).
  - Then the 22px headline, then every option at 13px with a 6px bar (the top bar in blue, the
    rest in slate).
  - Last is the question in faint text, as a button that shows it in the editor.
- **Model picker:** a 40px button with a tiny "MODEL" label over the mono model id. It opens
  upward: each model has a radio dot, its id and a one-line note from docs.typesafe.ai/models.
- **Policy tab rules:** one card, with a block per rule. Each block has a name line (mono id,
  and a faint hint on the right such as "By confidence · below review, a person decides").
  Then come aligned rows on a `92px · slider · 56px` grid: label, full-width slider, value in
  a muted pill. Presets sit under a "START FROM A PRESET" label as small pill buttons.
- **Policy card:**
  - brand-soft background with a `brand/30` border
  - a mono "SIMULATED POLICY · <title>" label
  - a blue pill with the measured value
  - the action at 18px, prefixed "→"
  - a blue slider
  - a one-line note that the model is not called again
- **Capsule row (homepage):** badge and id on the left, a blue bar in the middle, the value and
  a caption on the right.
- **Radius:** 14px for cards, 12px for inputs, 10px for buttons, fully rounded for pills.
- **Borders:** 1px everywhere; dashed for rules inside a panel.
- **Shadows:** `shadow-float` on the homepage console and dialogs only.

### Lyzr brand

The user supplied Lyzr's logo on 2026-09-22. The assets are in `public/brand/`, each in an
ink version (light mode) and a light version (dark mode), and `LyzrLogo` in
`components/layout/lyzr-logo.tsx` renders both and lets the `dark` class choose.
- **Nav:** the Lyzr mark (24px) as the app icon, "Jev Lab", then "by" and the `lyzr` wordmark
  (13px), linking to lyzr.ai.
- **Footer:** "Built by" and the wordmark.
- **About:** a "Built and paid for by" card with the full logo on a pastel tile.
- **Favicon and Apple icon:** `app/icon.png` and `app/apple-icon.png`, the solid mark.
- **Share image:** the mark and the wordmark.

Don't recolour, stretch or restyle the marks. Use them only in ink or light, at these sizes or
larger.

### Soft neo-pop

The user chose "soft neo-pop" (2026-09-22): cards and buttons pop a little, like printed
cut-outs, while staying tidy.
- **Cards** (`.shadow-card`): a line a shade darker than a hairline (`--pop-line`) and a 2px
  hard offset shadow in soft stone (`--pop-shadow`), with no blur. A card that is a link or
  a button lifts 1px up and left on hover and sinks on press.
- Keep it subtle: the user found an ink line and a black shadow "too much and too dark"
  (2026-09-22).
- **Buttons** (`.pop-press` on the default and outline variants): a 2px offset shadow. They
  rise 1px on hover and sink fully into the shadow when pressed.
- **Pastel fills** (`bg-pastel-1…5`: mint, peach, lilac, sky, butter) go only on key tiles.
  That means stat tiles, the homepage link tiles, the privacy at-a-glance tiles, and icon
  chips in `IconCard` and on the cheatsheet patterns. Use `pastel(i)` for a set and
  `pastelFor(label)` for a stable colour.
- **Dark mode:** the line is a low grey and the shadow near-black, so the pop reads as depth
  rather than outline.
- The rules are unlayered and sit last in `globals.css`, so they win over `border-border`.
- Reduced motion keeps the look but drops the movement.

### Visuals over paragraphs

Where a page would explain something in a paragraph, show it first. The pieces live in
`components/visuals/`:
- `RequestFlow` / `RequestFlowCompact`: state → typed questions → answers, playing when
  scrolled into view.
- `ChoiceViz`, `ScoreViz`, `NoulViz`, `ConfidenceViz`, `SplitViz`: one picture per concept,
  also used at the top of each lesson.
- `DataFlow`: nodes joined by lines, with a travelling packet. An array of nodes is a
  parallel branch.
- `Race`: latency bars drawn to scale.
- `IconCard` (server-safe): an icon, a title, one or two lines.

Numbers in a visual are illustrative and say so, or they are cited (the Race uses TypeSafe's
consistency cookbook). Server pages pass icons to client visuals by name, never as
components. Long explanations fold into a `<details>` ("The raw request", "How it's built").

### Motion

- Answer cards fade and rise in with a stagger.
- Bars fill over 700ms with `ease-signal`.
- The homepage console types its state.
- In-flight runs show the pixel-grid "Deciding" loader.
- Honour `prefers-reduced-motion`.

### Content rules

- There are 38 use cases in `content/presets/use-cases.ts`, mapped to TypeSafe's
  use-case map. Each has a category, an industry and a decision shape, and every one of the
  ten decision shapes has at least one example. Each also has:
  - a realistic, specific state
  - Choice, Noul and Score questions
  - an escape option on every Choice
  - one condition per Noul, so it lints clean
  - a named decision, which is the policy card
- Answers shown before a run are real recordings, labelled "replay".

### Implementation notes

- Colours only through tokens. The tokens live in `app/globals.css` under
  `[data-theme='sage']`, and Sage's component files are re-themed through them.
- Keep this direction unless the user changes it.
