# FinePrint — Manifesting the City

AI compliance copilot for NYC **Local Law 97** (building carbon-emissions law). Type a building → its real carbon fine for each compliance period, the **2030 cliff**, a plain-English explanation with citations, and the **cost-optimal, rebate-funded retrofit plan** to drive the fine toward $0 — then zoom out to portfolio / city-wide impact.

Built for the **"Manifesting a Better City: AI × Sustainability"** hackathon (#NYTechWeek).

> **The one rule:** code computes every number; Claude only ranks, explains, narrates, extracts, and cites. They never cross. The deterministic engine is the entire trust story.

## Status

| Phase | What | State |
|---|---|---|
| **P0** | Remade LL97 engine + Next 16 scaffold | 🟢 engine green (13 tests), scaffold up |
| P0 (cont.) | Data layer (GeoSearch → LL84 → CBL), cache, result card + cliff chart | ⏳ next |
| P1 | Claude explainer · exact-enumeration optimizer (MACC + schedule) · RAG Q&A | 📋 planned |
| P2 | City-scale heatmap · portfolio · financing · equity overlay | 📋 planned |
| P3 | Agentic PDF/bill ingestion | 📋 planned |

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Recharts · `@anthropic-ai/sdk` · `better-sqlite3` · Vitest.

## Commands
```bash
npm install
npm test          # Vitest — engine/data/optimizer logic (keep green)
npm run typecheck # tsc --noEmit
npm run dev       # Next dev server
npm run build     # production build
```

## Layout
- `lib/ll97/` — remade deterministic engine (`constants` ESPM table + fuel coeffs, `engine` computeFine/computeAllPeriods, `emissions` fuel recompute). Source-of-every-number.
- `app/` — Next App Router UI + API routes.
- `data/` — catalogs + local cache (generated). *(rebuilt in P1/P2)*
- `docs/` — `build-prompt-v2.md` (concept brief), `hackathon-rules.md`, `references/*.pdf` (§103-14 primary sources), and `superpowers/` (the full spec + P0–P3 implementation plans).
- `reference/` — **read-only** carried-over original engine; remade fresh under `lib/` per the remake protocol. Do not import from here.

## Plans & spec
- Spec: `docs/superpowers/specs/2026-06-06-fineprint-v2-manifesting-the-city-design.md`
- Plans: `docs/superpowers/plans/` — start at the `…implementation-index.md` (overview + locked interface contract).

## Honesty
Every output is a labeled **estimate**; the official compliance figure requires a registered design professional. Article 321 (affordable-housing) is a user toggle plus the DOB covered-buildings-list flag, since the >35% rent-regulated threshold can't be proven from public data.
