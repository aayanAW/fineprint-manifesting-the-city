# DESIGN.md — "The Ledger"

## Theme

Light, paper-first. Scene: a board member reading a compliance verdict at a desk in daylight, deciding on a seven-figure retrofit. Print metaphor demands paper.

## Color (strict monochrome, Restrained)

- `--color-paper` #fcfcfa (warm paper, never #fff)
- `--color-ink` #111110 (warm ink, never #000)
- `--color-ink-60` #555550 · `--color-ink-40` #8a8a84 · `--color-ink-20` #c9c9c2
- `--color-hairline` #e4e4de · `--color-wash` #f3f3ee
- No accent color. Danger/overage is signaled by diagonal hatching (`.hatch`), weight, scale, and underlines.

## Typography

- Display: Fraunces (variable, opsz axis), weights 300–600. Big numerals, verdicts, masthead.
- Data/labels/body: Spline Sans Mono, weights 300–500. `tnum` everywhere.
- `.legal-label`: 10px, 0.18em tracking, uppercase, ink-60. The connective tissue.
- Scale contrast ≥1.25 between hierarchy steps; verdict numerals use clamp() to ~6rem.

## Structure & rules

- Double rules (`.rule-double`) for masthead/section heads, hairlines elsewhere.
- Ledger sections numbered 01/02/03/04 in tabs and section heads.
- Footnote superscripts (`.fn`) link claims to the provenance fine print at the bottom.
- No cards-in-cards. Tables and ruled lists over card grids.

## Motion

- One orchestrated page-load: staggered `.rise` (rise-1…rise-5), `ledger-rule` scaleX draw-in.
- `--ease-ledger`: cubic-bezier(0.23,1,0.32,1). Transform/opacity only. Reduced-motion → fades.

## Charts (Recharts)

- Bars: compliant = wash fill + ink hairline stroke; over-limit = `url(#hatch)` SVG pattern fill.
- Limit lines: dashed ink ReferenceLine with mono labels.
- Axes: 10–11px mono, ink-40. No gridlines louder than hairline.

## Components

- Primitives in components/ui (button, input, tabs): hand-rolled, square corners, min-h-11 touch targets.
- Dashboard in components/dashboard. Provenance rendered verbatim, always.

## Copy

- No em dashes in UI copy. No lorem ipsum. Estimates labeled "estimate"; the official figure requires a registered design professional.
