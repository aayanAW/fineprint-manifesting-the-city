# FinePrint v2 — "Manifesting the City" — Design Spec

**Date:** 2026-06-06
**Target event:** "Manifesting a Better City: AI × Sustainability" (#NYTechWeek), judged by academics (CMU, CalTech, Columbia, Stanford). Judged on real-world impact, equity, and genuine (non-wrapper) use of AI.
**Repo:** `fineprint-manifesting-the-city` (GitHub: `aayanAW/fineprint-manifesting-the-city`).
**Source brief:** `docs/build-prompt-v2.md`. **Judging:** `docs/hackathon-rules.md`.

---

## 1. Product in one line
Enter a NYC building → pull its real public energy data → compute its Local Law 97 carbon fine for each compliance period → show the **2030 cliff** → explain it in plain English with citations → generate the **cost-optimal retrofit plan** that drives the fine toward $0 → zoom out to portfolio / city-wide impact.

## 2. The one inviolable rule
**Code computes every number; Claude only ranks, explains, narrates, extracts, and cites. They never cross.** The deterministic engine produces every emissions figure, limit, fine, cost, payback, MACC point, and optimizer result. The LLM is told, structurally, never to alter or invent a number. This boundary is the entire trust story and the answer to "is this a genuine use of AI, not a wrapper."

## 3. Stack
- **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Recharts · react-leaflet · `@anthropic-ai/sdk` · Vitest.** One repo. (Chosen over the build prompt's Python suggestion to reuse the verified TS engine; build prompt explicitly allows matching the existing stack.)
- **Local cache:** SQLite (`better-sqlite3`) for the LL84 dataset + a precomputed `city-aggregate.json`. Full demo runs offline (venue-wifi-proof).
- **Map:** `react-leaflet` (no Mapbox token to leak/expire).

## 4. Provenance & the remake protocol (integrity)
Two reference codebases exist:
1. **Local original FinePrint** (carried into this repo as a seed): verified `lib/ll97/*` engine + `lib/advise/roi.ts` ROI/rebate matching + `data/catalogs/` (7 measures, 14 rebates) + 67 passing tests. **Has the ROI/financing layer.**
2. **`github.com/aaravmin/fineprint`** (the parallel SpacetimeDB build): a cleaner engine (`computeFine`/`computeAllPeriods`, provenance/notes, recomputed-emissions-from-fuel, Article 321), a full data layer (`lookupBuilding` pipeline, DOF-aware BBL resolver, LL84 parser, **DOB Covered Buildings List snapshot `cbl26.json.gz` = 29,173 covered BBLs**), and an Anthropic tool-use layer. **Has the data + city-scale layer.** STDB-specific dirs (`spacetimedb/`, `module_bindings/`, `client/`) are out of scope.

**Remake protocol:** v2 synthesizes the best of both, **re-derived fresh during the hackathon** rather than copy-pasted. The carried-over `lib/`/`types/`/`test/` are relocated to `reference/` (read-only). Constants are re-transcribed from the primary sources in `docs/references/` (`rcny_103_14.pdf`, `ll97_emissions.pdf`) and cross-checked against both reference implementations. The CBL snapshot (`cbl26.json.gz`) is a public dataset and is reused as data; its loader is remade. Every remade computed value gets a golden test against DOB's published worked example.

## 5. Architecture & file structure
```
fineprint-manifesting-the-city/
  app/
    page.tsx                  # search → result card (P0)
    city/page.tsx             # city-scale heatmap + portfolio (P2)
    api/building/route.ts     # address|BBL → BuildingFacts + FineResult[] (from cache)
    api/advise/route.ts       # ranked fixes + Claude explainer (P1)
    api/optimize/route.ts     # retrofit optimizer: MACC + schedule (P1)
    api/ask/route.ts          # fine-print RAG Q&A with citations (P1)
    api/ingest/route.ts       # PDF/bill → Claude extraction (P3, optional)
  components/
    SearchBar · ResultCard · CliffChart · MaccChart · ScheduleTimeline
    FinancingList · AskPanel · CityMap · PortfolioFilter · ProvenanceFootnote
  lib/
    ll97/                     # REMADE engine (pure, tested)
      constants.ts            #   ESPM factors + penalty rate, sourced in comments
      engine.ts               #   computeFine / computeAllPeriods / Article 321
      emissions.ts            #   recompute from fuel columns (DOB basis)
    optimize/retrofit.ts      # NEW: exact-enumeration MACC + schedule + TCO
    advise/roi.ts             # REMADE: ROI + rebate matching (from local ref)
    data/
      geosearch.ts            # REMADE: DOF-aware BBL resolver
      ll84.ts                 # REMADE: Socrata 5zyy-y8am parser
      coveredBuildings.ts     # REMADE loader over cbl26.json.gz
      lookup.ts               # REMADE: address → BuildingFacts orchestrator
      cache.ts                # NEW: SQLite reader/writer
    ai/
      advise.ts               # REMADE: Claude ranker/explainer (structured output)
      ask.ts                  # NEW: RAG answer with citations
      tools.ts                # REMADE: Anthropic tool-use (assess_building)
      extract.ts              # NEW (P3): document extraction
    rag/
      retrieve.ts             # NEW: BM25 over curated corpus
      corpus/*.md             # NEW: LL97 / Art 320-321 / DOB rule chunks + source URLs
  data/
    catalogs/{measures,rebates}.ts   # REMADE from local ref
    cbl/cbl26.json.gz                # REUSED public snapshot (loader remade)
    cache/ll84.sqlite                # generated by scripts/fetch-ll84
    cache/city-aggregate.json        # generated by scripts/precompute-city
    cache/llm/*.json                 # cached demo LLM responses
    dac/disadvantaged.json           # NYS DAC / EJ overlay (P2 equity)
  scripts/
    fetch-ll84.ts             # one-time: Socrata → SQLite
    precompute-city.ts        # run engine over all covered BBLs → aggregate JSON
  reference/                  # read-only: carried-over local engine + notes pointing to aaravmin/fineprint
  test/                       # remade golden + unit tests
```

## 6. Component specs

### 6.1 Engine (`lib/ll97`) — REMADE, deterministic, pure
- `computeFine(building, period) -> FineResult`, `computeAllPeriods(building) -> FineResult[]` over `2024-2029`, `2030-2034`, `2035-2039`.
- **Limit** = Σ over occupancy groups [ `espmFactor(group, period)` × `sqft` ]. ESPM property-type factors (60 rows) transcribed from `1 RCNY §103-14(d)(3)`; statutory occupancy-letter table as flagged fallback.
- **Emissions**: prefer LL84 *reported* GHG (eGRID basis, flagged); also provide **recompute from fuel columns** (electricity, natural gas, #2/#4 oil, district steam) using the statute coefficients — the figure DOB's penalty math uses. Null any fuel lacking a verified coefficient and flag it.
- **Penalty** = `268 × max(0, emissions − limit)` per year. Money in integer cents internally; round tCO2e to 2 dp (matches DOB example), money to the cent.
- **Article 321** (affordable/rent-regulated): no $ fine; report the 2030 limit as the target; user toggle (can't be proven from public data) plus the CBL pathway flag where present.
- `FineResult.notes[]` carries every honesty caveat; UI renders verbatim.
- **Golden test:** reproduce DOB's published worked example exactly.

### 6.2 Data layer (`lib/data`) — REMADE
- `lookupBuilding(address) -> BuildingFacts` chains GeoSearch (DOF-aware resolver: pick highest-ranked candidate the CBL knows, but only among candidates with the queried house number) → LL84 (latest filing wins, "Not Available" → null, LL84 use names mapped to ESPM vocabulary) → CBL coverage/Article-321 flag.
- Every field carries `provenance` (which dataset said it); nulls never guessed.
- `cache.ts`: read building facts from local SQLite first; live Socrata only on cache miss.

### 6.3 Retrofit optimizer (`lib/optimize/retrofit.ts`) — NEW, the technical-depth centerpiece
- Catalog = 7 measures → **2⁷ = 128 subsets**. Enumerate all (exact, MILP-equivalent — search space is tiny, so no heuristic needed).
- For each subset: compound emission reductions on remaining emissions; sum capex − best-matched rebates; project annual fines through 2050 per period; objective **TCO = capex + Σ fines-to-2050 + energy cost**. Pick the min-TCO subset that meets the chosen compliance target.
- **MACC** = per-measure `$/tCO2e abated` (netCost ÷ tCO2eReduced), sorted ascending → marginal abatement cost curve.
- **Schedule** = chosen measures ordered by MACC, placed before the 2030 cliff (what to do now vs. before 2030).
- **Uncertainty**: each measure has low/high reduction %; re-run optimizer at both → report ranges, not false precision.
- LLM **narrates** this output; never produces it.
- **Golden test:** hand-checked MACC values + a known-optimal subset on a fixture building.

### 6.4 Fine-print RAG (`lib/rag` + `lib/ai/ask.ts`) — NEW
- Curated corpus: LL97 statute, Article 320/321, key DOB rule chunks — each chunk tagged with its source URL.
- BM25 (keyword) retrieve top-k → Claude answers **with inline citations**, instructed to refuse when unsupported. No embedding service ⇒ works offline.
- Must handle "Do I qualify for the affordable-housing pathway?" and "What's a good-faith effort?"
- Honest label in UI: "answers over a curated LL97 corpus; verify against the cited source."

### 6.5 City-scale + portfolio (`app/city`, `scripts/precompute-city.ts`) — NEW
- Offline: run the engine over all covered BBLs (CBL + LL84 join) → compact `city-aggregate.json` (per building: bbl, lat/lon, emissions, 2030 limit, 2030 fine).
- `CityMap`: react-leaflet heatmap of fine exposure; aggregate tons over the 2030 limit + total $ exposure + sanity check vs. ~50k buildings / 2030 projections.
- Portfolio: filter by owner / BBL list.

### 6.6 Financing matcher + equity overlay (P2) — REMADE + NEW
- Financing: map each recommended measure to real funding (NYSERDA, Con Ed, IRA §179D & 48 ITC, C-PACE, NYC AHRF/REDi) via the remade catalogs → net cost + payback. (Re-verify IRA figures — they shifted in 2025.)
- Equity: overlay NYS Disadvantaged-Community / EJ data; auto-flag Article 321 eligibility + AHRF for qualifying buildings.

### 6.7 AI layer (`lib/ai`) — REMADE + NEW
- `advise.ts`: Claude (`claude-opus-4-8`, structured output) orders the code-computed fixes and writes the explainer/board summary — prose only.
- `tools.ts`: Anthropic tool-use shape; `assess_building` returns engine projections; the model never does arithmetic.
- `ask.ts` (RAG), `extract.ts` (P3 ingestion).
- **Demo robustness:** cache LLM responses for the 3 pre-cached demo buildings so nothing hangs on venue wifi. AI key optional → deterministic fallback (payback-ranking + templated explainer), badge reads "estimated".

## 7. Milestones (build & verify in order; pause after P0)
- **P0 — deterministic core.** Remade engine + golden test; data lookup from cache; result card showing emissions vs CP1 vs CP2 limit + fine each; **2030 cliff** unmissable (color + number going red); one bar chart with two limit lines. *Pause for number review.*
- **P1 — AI + optimization.** Explainer; optimizer (MACC + schedule + uncertainty); RAG Q&A with citations.
- **P2 — scale + money + equity.** City heatmap; portfolio; financing matcher; equity overlay.
- **P3 — agentic ingestion (if time).** Upload utility bill / ESPM export / audit PDF → Claude extraction fills structured inputs. Frame as agents: ingest → structure → RAG → optimize → narrate.

**Realistic cut line (≈3-hour slot):** P0 + P1 + the **city heatmap** from P2 is the target deliverable. Remaining P2 + P3 are stretch. Build in this order so there is always a working demo.

## 8. Demo script the build must support
1. Fast single-building lookup (3 pre-cached buildings incl. one affordable-housing building).
2. The 2030 cliff visual.
3. The city-scale heatmap ("we ran it on every covered building in NYC").
4. Fine-print Q&A with visible citations.
5. Whole flow runs end-to-end from cache with no live network.

## 9. Testing
- **TDD** for `lib/ll97` (golden vs DOB example) and `lib/optimize` (hand-checked MACC + known-optimal subset). Pure parsers tested against committed fixtures (offline).
- Engine/data tests stay green; add a golden test with every new computed value.
- UI verified by `npm run build` + headless-Chromium screenshots, not unit tests.

## 10. Scope guardrails
- No auth, no accounts. Local SQLite/JSON only — no heavy DB.
- **LL97 only.** Do not add LL84/LL88/LL95 as separate features — depth over breadth.
- The LLM never produces the fine.
- Every output is a labeled **estimate**; the official compliance figure requires a registered design professional.

## 11. Definition of done
- Penalty output matches a hand calculation for the known test buildings.
- City-wide aggregate passes an order-of-magnitude sanity check vs. ~50k buildings / 2030 projections.
- Full demo flow runs end-to-end from cache without live network.

## 12. Open risks / flags
- **Time.** The maximum-impact scope (P0–P3) exceeds a 3-hour slot; the cut line in §7 is the mitigation.
- **2035-2039 limits** are defined per ESPM type, not occupancy letter; letter-group fallbacks are flagged estimates.
- **IRA §179D/§45L figures** shifted in 2025 — re-verify before relying.
- **Article 321 detection** can't be proven from public data → user toggle + CBL flag, honestly labeled.
- **Strategy doc** referenced by the build prompt (`FinePrint-ManifestingTheCity-Strategy.md`) was not found in the repo; this spec proceeds from the build prompt + reference codebases.
