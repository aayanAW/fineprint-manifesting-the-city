# FinePrint v2 — Implementation Index & Interface Contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build FinePrint v2 ("Manifesting the City") — an AI compliance copilot for NYC Local Law 97 — for the AI×Sustainability hackathon, remaking the engine + data layer fresh and adding an exact-optimal retrofit optimizer, citation-backed RAG, and a city-scale map.

**Source of truth:** `docs/superpowers/specs/2026-06-06-fineprint-v2-manifesting-the-city-design.md`.

**The one rule:** Code computes every number; Claude only ranks/explains/narrates/extracts/cites. Never cross the boundary.

---

## Phase plans (build in order)

| Phase | Plan file | Produces | Depends on |
|---|---|---|---|
| **P0** | `2026-06-06-fineprint-v2-p0-deterministic-core.md` | Remade engine + data lookup + cache + result card + 2030 cliff chart. Working single-building demo. | — |
| **P1** | `2026-06-06-fineprint-v2-p1-ai-optimizer-rag.md` | Claude explainer + exact-enumeration optimizer (MACC + schedule) + RAG Q&A with citations. | P0 |
| **P2** | `2026-06-06-fineprint-v2-p2-scale-money-equity.md` | City-scale precompute + Leaflet heatmap + portfolio + financing matcher + equity overlay. | P0, P1 |
| **P3** | `2026-06-06-fineprint-v2-p3-agentic-ingestion.md` | PDF/bill/ESPM upload → Claude extraction → structured inputs. | P0, P1 |

**Realistic ~3hr cut line:** P0 + P1 + the city heatmap from P2 is the target. Build in order; always keep a working demo.

## Reference material (read, don't copy — remake)
- Local seed engine (reference): `lib/ll97/*`, `lib/advise/roi.ts`, `data/catalogs/*`, `types/*` in this repo (carried from original FinePrint).
- Parallel build clone: `/tmp/aaravmin-fineprint/` — `engine/src/{index,constants}.ts`, `data/src/{lookup,geosearch,ll84,coveredBuildings,types,tools}.ts`, `data/cbl/cbl26.json.gz`, `data/seed-buildings.json`, fixtures under `data/tests/fixtures/`.
- Primary sources: `docs/references/rcny_103_14.pdf`, `docs/references/ll97_emissions.pdf`.
- Next 16 conventions: `node_modules/next/dist/docs/` (read before writing route handlers — APIs differ from older Next).

## Remake protocol (integrity)
First task of P0 relocates the carried-over `lib/`, `types/`, `test/` to `reference/` (read-only). All engine/data/ROI code is re-derived fresh in new `lib/` files, validated against the golden DOB worked example. The CBL snapshot (`cbl26.json.gz`) is a public dataset, reused as data; its loader is remade.

---

## LOCKED INTERFACE CONTRACT

All phases implement against these exact types. Do not rename fields. New types may be added by a phase but these are frozen.

### Engine — `lib/ll97/engine.ts`
```ts
export type Period = "2024-2029" | "2030-2034" | "2035-2039";
export const PERIODS: Period[] = ["2024-2029", "2030-2034", "2035-2039"];

export interface BuildingInput {
  grossFloorAreaSqft: number;
  occupancyGroups: Array<{ group: string; sqft: number }>; // ESPM property-type names
  annualEmissionsTco2e: number;
  isArticle321?: boolean;
}

export interface FineResult {
  period: Period;
  emissionsLimitTco2e: number;
  actualEmissionsTco2e: number;
  overageTco2e: number;     // 0 if compliant
  annualFineUsd: number;    // 0 if compliant
  compliant: boolean;
  pathway: "standard" | "article321";
  notes: string[];          // honesty caveats, rendered verbatim
}

export function computeFine(building: BuildingInput, period: Period): FineResult;
export function computeAllPeriods(building: BuildingInput): FineResult[];
```

### Emissions recompute — `lib/ll97/emissions.ts`
```ts
export interface FuelUse {
  electricity_kWh?: number;
  naturalGas_kBtu?: number;
  fuelOil2_kBtu?: number;
  fuelOil4_kBtu?: number;
  districtSteam_kBtu?: number;
}
// Period-specific coefficients (electricity factor falls over time as the grid greens).
export function recomputeEmissions(
  fuel: FuelUse, period: Period
): { tco2e: number | null; unpriceableFuels: string[] };
```

### Data layer — `lib/data/types.ts`
```ts
export type Bbl = string;                    // 10-digit borough-block-lot
export interface BblResult { bbl: Bbl; normalizedAddress: string; borough: string; }
export interface UseSplit { group: string; sqft: number; } // ESPM names
export interface ProvenanceNote { field: string; source: string; detail?: string; }

export interface Ll84Facts {
  bbl: Bbl;
  reportedAddress: string | null;
  grossFloorAreaSqft: number | null;
  occupancyGroups: UseSplit[];
  annualEmissionsTco2e: number | null;        // reported (eGRID basis)
  recomputedEmissionsTco2e: number | null;    // DOB basis from fuel columns
  unpriceableFuels: string[];
  reportingYear: number | null;
  proxiedUses: Array<{ from: string; to: string }>;
  unmappedUses: UseSplit[];
}

export interface BuildingFacts {
  bbl: Bbl;
  address: string;
  grossFloorAreaSqft: number | null;
  occupancyGroups: UseSplit[];
  annualEmissionsTco2e: number | null;
  isLl97Covered: boolean | null;
  isArticle321: boolean | null;
  provenance: ProvenanceNote[];
}

export interface CblEntry { bbl: Bbl; ll97: boolean; article321: boolean; sqft: number | null; address: string | null; source: string; }
```
```ts
// lib/data/lookup.ts
export function lookupBuilding(address: string, sources?: LookupSources): Promise<BuildingFacts>;
// lib/data/coveredBuildings.ts
export function getCblEntry(bbl: Bbl): CblEntry | null;
export function isLl97Covered(bbl: Bbl): boolean;
```

### Catalogs — `data/catalogs/types.ts`
```ts
export interface Measure {
  key: string; name: string; appliesToFuel: string[];
  emissionsReductionPctLow: number; emissionsReductionPctHigh: number;
  typicalCostPerUnitUSDMax: number | null; typicalCostNote: string; url: string;
}
export interface RebateProgram {
  name: string; administrator: string; measures: string[];
  appliesToMultifamily: boolean; incomeEligibleBonus: boolean;
  amount: string; amountNumericMaxUSD: number | null;
  status: string; sunsetDate: string | null; url: string;
  incomeRestricted?: boolean; cashEligible?: boolean; asOfRight?: boolean;
}
export interface MatchedRebate { name: string; amount: string; amountShort: string; url: string; }
```

### Optimizer — `lib/optimize/retrofit.ts`
```ts
import type { FineResult, Period } from "@/lib/ll97/engine";
import type { Measure, RebateProgram, MatchedRebate } from "@/data/catalogs/types";

export interface MaccPoint { measureKey: string; name: string; tCO2eReduced: number; netCostUSD: number | null; costPerTonUSD: number | null; }
export interface ScheduledMeasure { measureKey: string; name: string; doByYear: number; }
export interface RetrofitPlan {
  chosenMeasureKeys: string[];
  capexUSD: number;
  totalFinesAvoidedUSD: number;     // through 2050, vs do-nothing
  tcoUSD: number;                   // capex + residual fines-to-2050
  residualEmissionsTco2e: number;   // 2030-2034 basis
  macc: MaccPoint[];                // sorted ascending by costPerTonUSD
  schedule: ScheduledMeasure[];
  range: { tcoLowUSD: number; tcoHighUSD: number };
  matchedRebatesByMeasure: Record<string, MatchedRebate[]>;
}
export interface OptimizeInput {
  fines: FineResult[];              // computeAllPeriods output
  fuels: string[];                  // 'gas'|'oil'|'steam'|'electric'
  units: number | null;            // dwelling-unit count for cost scaling
  isMultifamily: boolean;
  affordable: boolean;
  targetPeriod?: Period;           // default '2030-2034'
}
export function optimizeRetrofit(input: OptimizeInput, measures: Measure[], rebates: RebateProgram[]): RetrofitPlan;
```

### AI — `lib/ai/*`
```ts
// lib/ai/advise.ts
export interface FixCandidate {
  measureKey: string; measure: string; tCO2eReduced: number;
  grossCostUSD: number | null; matchedRebates: MatchedRebate[];
  netCostUSD: number | null; paybackYears: number | null;
  fineAvoidedUSD: number; rationale?: string;
}
export interface AdvicePlan {
  explainer: string; boardSummary: string; rankedFixes: FixCandidate[];
  source: "ai" | "fallback"; planPeriod?: string; planPeriodFineUSD?: number;
}
export function generateAdvice(facts: BuildingFacts, fines: FineResult[], candidates: FixCandidate[], planPeriod?: Period): Promise<AdvicePlan>;

// lib/ai/ask.ts
export interface Citation { source: string; url: string; quote: string; }
export interface RagAnswer { answer: string; citations: Citation[]; }
export function answerLawQuestion(question: string): Promise<RagAnswer>;
```

### API routes (Next 16 App Router; return `Response.json(...)`, not `NextResponse`)
```
POST /api/building  { address?: string; bbl?: string }            -> { facts: BuildingFacts; fines: FineResult[] }
POST /api/advise    { facts: BuildingFacts; fines: FineResult[]; planPeriod?: Period } -> AdvicePlan
POST /api/optimize  { facts: BuildingFacts; fines: FineResult[] } -> RetrofitPlan
POST /api/ask       { question: string }                          -> RagAnswer
POST /api/ingest    { text: string }                              -> Partial<BuildingInput>   (P3)
```

## Shared conventions
- **Tests:** `npm test` (Vitest). Engine/data/optimizer are TDD. Commands: `npx vitest run path/to.test.ts`.
- **Types/build:** `npx tsc --noEmit`; `npm run build` must pass before any deploy.
- **UI verification:** `npm run build` + headless-Chromium screenshots; read the PNGs.
- **Server hygiene:** `pkill -f "next start"` before `npm start`.
- **Commits:** frequent, conventional; end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **AI key optional:** every AI route has a deterministic fallback; badge reads "estimated" when no key.
- **Tailwind v4:** tokens/keyframes in `app/globals.css`; animate only transform/opacity; `tabular-nums` on numbers; respect `prefers-reduced-motion`.
