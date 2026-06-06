# FinePrint v2 — P1 AI + Optimizer + RAG — Implementation Plan

> For agentic workers: execute task-by-task with **superpowers:subagent-driven-development** (or **superpowers:executing-plans**). Every task follows the TDD rhythm — write the failing test, run it (expect FAIL), write the minimal implementation, run it (expect PASS), then commit with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. Do NOT move number-computation into the AI path: **code computes every number; Claude only orders, explains, narrates, and cites.** Implement the LOCKED INTERFACE CONTRACT from `docs/superpowers/plans/2026-06-06-fineprint-v2-implementation-index.md` verbatim — do not rename any field.

**Goal:** Add the AI + optimization layer on top of P0's deterministic core. Produce (1) `lib/optimize/retrofit.ts` — an exact 2^N-subset retrofit optimizer that computes the minimum-TCO measure set, a marginal-abatement-cost curve (MACC), a pre-2030 schedule, and an uncertainty range (the technical-depth centerpiece); (2) a remade `lib/advise/roi.ts` that builds code-computed `FixCandidate[]` with rebate matching and payback; (3) a remade `lib/ai/advise.ts` where Claude (`claude-opus-4-8`, structured output) **orders** code-computed fixes and writes prose, with a deterministic fallback; (4) a citation-backed RAG (`lib/rag/corpus/*.md` + BM25 `lib/rag/retrieve.ts` + `lib/ai/ask.ts`) that answers LL97 questions and refuses when unsupported; (5) the three API routes; (6) cached LLM responses for the 3 demo buildings; (7) the UI: MaccChart, ScheduleTimeline, AskPanel, FinancingList, wired into `app/page.tsx`.

**Architecture:** The deterministic engine from P0 (`lib/ll97/engine.ts` → `computeFine`, `computeAllPeriods`, `Period`, `FineResult`) and data layer (`lib/data` → `lookupBuilding`, `BuildingFacts`) and `data/catalogs/{measures,rebates}.ts` already exist. P1 sits on top:
```
                    P0 engine.computeAllPeriods(building) -> FineResult[]
                                       │
        ┌──────────────────────────────┼───────────────────────────────┐
        ▼                              ▼                                ▼
lib/optimize/retrofit.ts        lib/advise/roi.ts                lib/rag/retrieve.ts
  optimizeRetrofit()              computeCandidateFixes()           bm25Retrieve()
  (2^N subsets, MACC,             (FixCandidate[], rebate           (top-k corpus chunks)
   schedule, TCO, range)           match, payback)                        │
        │                              │                                  ▼
        │                              ▼                            lib/ai/ask.ts
        │                       lib/ai/advise.ts                    answerLawQuestion()
        │                       generateAdvice()                    (Claude cites; fallback
        │                       (Claude ORDERS + prose;              returns top chunks)
        │                        fallback templated)
        ▼                              ▼                                  ▼
 /api/optimize                   /api/advise                          /api/ask
        └──────────────────────────────┴───────────────────────────────┘
                                       ▼
       UI: MaccChart · ScheduleTimeline · FinancingList · AskPanel  (app/page.tsx)
```
Boundary rule: the optimizer and `roi.ts` emit every dollar, ton, $/tCO2e, and year. `advise.ts` and `ask.ts` receive those numbers as authoritative inputs and are structurally told never to alter them — Claude reorders an array of measure keys and writes prose; it never multiplies.

**Tech Stack:** Next.js 16 (App Router, `Response.json(...)` not `NextResponse`) · React 19 · TypeScript · Tailwind v4 (tokens/keyframes in `app/globals.css`) · Recharts · `@anthropic-ai/sdk` (model `claude-opus-4-8`, structured output via `output_config.format`, adaptive surface; `ANTHROPIC_API_KEY` optional → deterministic fallback, badge "estimated") · Vitest. Tests: `npx vitest run <path>`. Type check: `npx tsc --noEmit`. Build: `npm run build`.

---

## Task 1 — Retrofit optimizer: golden math fixture + hand calculation

**Files**
- Create: `lib/optimize/fixtures.ts` (test fixture + the documented hand calculation)
- Test: `lib/optimize/macc.test.ts`

This task pins the math before any optimizer code exists. The fixture is a synthetic building with round numbers so the hand calculation is checkable by eye. Subsequent tasks make these assertions pass.

### The fixture building (hand calculation, shown in full)

A 100,000 sqft multifamily building, all gas-heated, 100 dwelling units, **1,000 tCO2e/yr actual emissions in every period** (we hold actual emissions flat for the fixture so the arithmetic is transparent; the real engine drops electricity factors over time, but this fixture's emissions are gas, which the statute holds ~flat).

P0 `computeAllPeriods` for this fixture returns these `FineResult` limits (these exact numbers are what the fixture asserts the engine produces — Task 1 hard-codes them as the optimizer's `fines` input so the optimizer test is independent of engine internals):

| Period | limit tCO2e | actual tCO2e | overage tCO2e | annualFineUSD (= 268 × overage) |
|---|---|---|---|---|
| 2024-2029 | 800 | 1000 | 200 | 53,600 |
| 2030-2034 | 400 | 1000 | 600 | 160,800 |
| 2035-2039 | 250 | 1000 | 750 | 201,000 |

We use a **3-measure** catalog subset for the hand calculation (the production run uses the full 7; 3 keeps the by-hand enumeration to 2³ = 8 rows). Measures (reduction % is the **mid** of low/high, applied to remaining emissions; capex = perUnitCost × 100 units; rebate = single best per-unit cash × 100 units):

| key | mid reduction % | perUnitCost | bestPerUnitCashRebate | capex (×100) | rebate (×100) | netCapex |
|---|---|---|---|---|---|---|
| heat-pump | 50% | $30,000 | $5,000 | $3,000,000 | $500,000 | $2,500,000 |
| controls | 20% | $1,000 | $0 | $100,000 | $0 | $100,000 |
| lighting | 5% | $200 | $0 | $20,000 | $0 | $20,000 |

**MACC (per-measure, standalone on the 1000 tCO2e base):**
- heat-pump: reduces 1000 × 0.50 = **500 tCO2e**; netCost $2,500,000 → **$5,000/tCO2e**
- controls: reduces 1000 × 0.20 = **200 tCO2e**; netCost $100,000 → **$500/tCO2e**
- lighting: reduces 1000 × 0.05 = **50 tCO2e**; netCost $20,000 → **$400/tCO2e**

MACC sorted ascending by $/tCO2e: **[lighting ($400), controls ($500), heat-pump ($5,000)]**.

**TCO objective for a subset** = netCapex + Σ residual annual fines from now through **2050** (inclusive), where each period contributes its annual fine × (number of years that period covers within the 2024–2050 window):
- 2024-2029 spans 2024..2029 = **6 years**
- 2030-2034 spans 2030..2034 = **5 years**
- 2035-2039 spans 2035..**2050** = **16 years** (the final defined period's limit is carried forward to 2050, the modeling horizon)

For a subset, **residual emissions compound**: applying measures in any order, residual = 1000 × Π(1 − pct_i). Residual emissions are then re-fined against each period's limit (overage = max(0, residual − limit), annualFine = 268 × overage). Per the contract, `residualEmissionsTco2e` is reported on the **2030-2034 basis**.

Worked TCO for the two subsets that matter:

*do-nothing (empty subset):* netCapex 0; residual 1000 in all periods.
- 2024-2029 fine 53,600 × 6 = 321,600
- 2030-2034 fine 160,800 × 5 = 804,000
- 2035-2039 fine 201,000 × 16 = 3,216,000
- TCO = **4,341,600** (this is the do-nothing baseline; `totalFinesAvoidedUSD` is measured against it)

*{heat-pump} alone:* residual = 1000 × (1 − 0.50) = **500 tCO2e**.
- 2024-2029: overage max(0, 500 − 800) = 0 → fine 0
- 2030-2034: overage max(0, 500 − 400) = 100 → 268 × 100 = 26,800/yr × 5 = 134,000
- 2035-2039: overage max(0, 500 − 250) = 250 → 268 × 250 = 67,000/yr × 16 = 1,072,000
- netCapex 2,500,000
- TCO = 2,500,000 + 0 + 134,000 + 1,072,000 = **3,706,000**

*{heat-pump, controls}:* residual = 1000 × 0.50 × 0.80 = **400 tCO2e**.
- 2024-2029: max(0, 400 − 800) = 0 → 0
- 2030-2034: max(0, 400 − 400) = 0 → 0  ← **meets the 2030-2034 target exactly**
- 2035-2039: max(0, 400 − 250) = 150 → 268 × 150 = 40,200/yr × 16 = 643,200
- netCapex 2,500,000 + 100,000 = 2,600,000
- TCO = 2,600,000 + 0 + 0 + 643,200 = **3,243,200**

*{heat-pump, controls, lighting}:* residual = 1000 × 0.50 × 0.80 × 0.95 = **380 tCO2e**.
- 2030-2034: max(0, 380 − 400) = 0 → 0
- 2035-2039: max(0, 380 − 250) = 130 → 268 × 130 = 34,840/yr × 16 = 557,440
- netCapex 2,600,000 + 20,000 = 2,620,000
- TCO = 2,620,000 + 0 + 0 + 557,440 = **3,177,440**

Among all 8 subsets, the **minimum-TCO subset that meets the 2030-2034 limit (residual ≤ 400)** is `{heat-pump, controls, lighting}` at **TCO 3,177,440**, because adding lighting (net $20k) avoids $20,000 of extra 2035-2050 fines (130→ saves 20 tCO2e × 268 × 16 = $85,760... wait: 643,200 − 557,440 = 85,760 saved for $20,000 spent — strongly positive, so lighting is included). So the optimal qualifying subset is the full 3. (The optimizer enumerates exactly this; do not hand-wave — the test below hard-codes these totals.)

`totalFinesAvoidedUSD` for the optimal subset = baseline TCO's fine portion (4,341,600) − optimal subset's fine portion (557,440) = **3,784,160**.

> **Energy term.** The contract's TCO definition is `capex + Σ residual fines-to-2050 + energy term`. For P1 the energy term is a per-measure annual energy-cost delta defaulting to **0** (we do not have a verified $/kWh-displaced figure per measure in the catalog, and inventing one would cross the honesty line). It is implemented as a pluggable `energyDeltaUSD(measureKey)` hook returning 0 by default, so the term is present in the objective and testable, but contributes nothing until a verified figure is added. This keeps every TCO number defensible. The golden test asserts the 0-energy totals above.

### Steps
- [ ] 1.1 Create `lib/optimize/fixtures.ts` exporting the fixture and its expected results:
```ts
import type { FineResult, Period } from "@/lib/ll97/engine";
import type { Measure, RebateProgram } from "@/data/catalogs/types";

/** Synthetic 100k-sqft, 100-unit, all-gas multifamily building; 1000 tCO2e flat. */
export const GOLDEN_FINES: FineResult[] = [
  { period: "2024-2029", emissionsLimitTco2e: 800, actualEmissionsTco2e: 1000, overageTco2e: 200, annualFineUsd: 53600, compliant: false, pathway: "standard", notes: [] },
  { period: "2030-2034", emissionsLimitTco2e: 400, actualEmissionsTco2e: 1000, overageTco2e: 600, annualFineUsd: 160800, compliant: false, pathway: "standard", notes: [] },
  { period: "2035-2039", emissionsLimitTco2e: 250, actualEmissionsTco2e: 1000, overageTco2e: 750, annualFineUsd: 201000, compliant: false, pathway: "standard", notes: [] },
];

/** 3-measure catalog used by the golden test (production uses all 7). mid = (low+high)/2. */
export const GOLDEN_MEASURES: Measure[] = [
  { key: "heat-pump", name: "Heat pump", appliesToFuel: ["gas", "oil", "steam"], emissionsReductionPctLow: 40, emissionsReductionPctHigh: 60, typicalCostPerUnitUSDMax: 30000, typicalCostNote: "fixture", url: "" },
  { key: "controls", name: "Controls", appliesToFuel: ["gas", "oil", "steam"], emissionsReductionPctLow: 15, emissionsReductionPctHigh: 25, typicalCostPerUnitUSDMax: 1000, typicalCostNote: "fixture", url: "" },
  { key: "lighting", name: "Lighting", appliesToFuel: ["electric", "gas", "oil", "steam"], emissionsReductionPctLow: 2, emissionsReductionPctHigh: 8, typicalCostPerUnitUSDMax: 200, typicalCostNote: "fixture", url: "" },
];

/** One $5k/unit cash heat-pump rebate; nothing for controls/lighting. */
export const GOLDEN_REBATES: RebateProgram[] = [
  { name: "Fixture HP rebate", administrator: "fixture", measures: ["heat-pump"], appliesToMultifamily: true, incomeEligibleBonus: false, amount: "$5,000/unit", amountNumericMaxUSD: 5000, status: "active", sunsetDate: null, url: "", cashEligible: true, asOfRight: true },
];

export const GOLDEN_INPUT = {
  fines: GOLDEN_FINES,
  fuels: ["gas"],
  units: 100,
  isMultifamily: true,
  affordable: false,
  targetPeriod: "2030-2034" as Period,
};

/** Hand-checked expectations (see plan Task 1 for the full derivation). */
export const GOLDEN_EXPECTED = {
  maccSortedKeys: ["lighting", "controls", "heat-pump"],
  maccCostPerTon: { "lighting": 400, "controls": 500, "heat-pump": 5000 },
  maccTonsReduced: { "lighting": 50, "controls": 200, "heat-pump": 500 },
  chosenMeasureKeys: ["heat-pump", "controls", "lighting"],
  capexUSD: 2620000,          // gross 3,120,000 − rebate 500,000
  residualEmissionsTco2e: 380, // 2030-2034 basis, 1000 × .5 × .8 × .95
  tcoUSD: 3177440,
  totalFinesAvoidedUSD: 3784160,
  doNothingTcoUSD: 4341600,
};
```
- [ ] 1.2 Create `lib/optimize/macc.test.ts` asserting only the MACC math (the optimizer impl lands in Task 2; this test will reference `buildMacc` which does not exist yet):
```ts
import { describe, it, expect } from "vitest";
import { buildMacc } from "@/lib/optimize/retrofit";
import { GOLDEN_MEASURES, GOLDEN_REBATES, GOLDEN_EXPECTED } from "@/lib/optimize/fixtures";

describe("MACC", () => {
  it("computes per-measure $/tCO2e on the 1000 tCO2e base and sorts ascending", () => {
    const macc = buildMacc(1000, GOLDEN_MEASURES, GOLDEN_REBATES, { units: 100, isMultifamily: true, affordable: false, fuels: ["gas"] });
    expect(macc.map(m => m.measureKey)).toEqual(GOLDEN_EXPECTED.maccSortedKeys);
    for (const p of macc) {
      expect(p.tCO2eReduced).toBeCloseTo(GOLDEN_EXPECTED.maccTonsReduced[p.measureKey], 6);
      expect(p.costPerTonUSD).toBeCloseTo(GOLDEN_EXPECTED.maccCostPerTon[p.measureKey], 6);
    }
  });
});
```
- [ ] 1.3 Run `npx vitest run lib/optimize/macc.test.ts` — **expect FAIL** (`buildMacc` is not exported / file does not exist).
- [ ] 1.4 Commit the fixture + failing test: `git add lib/optimize/fixtures.ts lib/optimize/macc.test.ts && git commit -m "test(optimize): golden MACC fixture + hand calculation"` (with the Co-Authored-By trailer).

---

## Task 2 — Retrofit optimizer implementation (MACC + 2^N subset enumeration + TCO)

**Files**
- Create: `lib/optimize/retrofit.ts`
- Test: `lib/optimize/retrofit.test.ts`

### Steps
- [ ] 2.1 Create `lib/optimize/retrofit.test.ts` covering the full plan (subset selection, capex, TCO, fines-avoided, residual, schedule):
```ts
import { describe, it, expect } from "vitest";
import { optimizeRetrofit } from "@/lib/optimize/retrofit";
import { GOLDEN_INPUT, GOLDEN_MEASURES, GOLDEN_REBATES, GOLDEN_EXPECTED } from "@/lib/optimize/fixtures";

describe("optimizeRetrofit (golden)", () => {
  const plan = optimizeRetrofit(GOLDEN_INPUT, GOLDEN_MEASURES, GOLDEN_REBATES);

  it("picks the min-TCO subset that meets the 2030-2034 limit", () => {
    expect([...plan.chosenMeasureKeys].sort()).toEqual([...GOLDEN_EXPECTED.chosenMeasureKeys].sort());
  });
  it("computes capex net of the single best cash rebate", () => {
    expect(plan.capexUSD).toBe(GOLDEN_EXPECTED.capexUSD);
  });
  it("computes TCO = capex + residual fines to 2050", () => {
    expect(plan.tcoUSD).toBeCloseTo(GOLDEN_EXPECTED.tcoUSD, 2);
  });
  it("computes fines avoided vs do-nothing", () => {
    expect(plan.totalFinesAvoidedUSD).toBeCloseTo(GOLDEN_EXPECTED.totalFinesAvoidedUSD, 2);
  });
  it("reports residual emissions on the 2030-2034 basis", () => {
    expect(plan.residualEmissionsTco2e).toBeCloseTo(GOLDEN_EXPECTED.residualEmissionsTco2e, 6);
  });
  it("emits a MACC sorted ascending by cost per ton", () => {
    expect(plan.macc.map(m => m.measureKey)).toEqual(GOLDEN_EXPECTED.maccSortedKeys);
  });
  it("schedules chosen measures by MACC, all before the 2030 cliff", () => {
    expect(plan.schedule.map(s => s.measureKey)).toEqual(GOLDEN_EXPECTED.maccSortedKeys.filter(k => plan.chosenMeasureKeys.includes(k)));
    for (const s of plan.schedule) expect(s.doByYear).toBeLessThanOrEqual(2029);
  });
  it("reports an uncertainty range bracketing the point TCO", () => {
    expect(plan.range.tcoLowUSD).toBeLessThanOrEqual(plan.tcoUSD);
    expect(plan.range.tcoHighUSD).toBeGreaterThanOrEqual(plan.tcoUSD);
  });
  it("attaches matched rebates per chosen measure", () => {
    expect(plan.matchedRebatesByMeasure["heat-pump"].length).toBeGreaterThan(0);
    expect(plan.matchedRebatesByMeasure["heat-pump"][0].amountShort).toMatch(/\$5k\/unit/);
  });
});

describe("optimizeRetrofit (already compliant)", () => {
  it("chooses the empty set when do-nothing meets the target", () => {
    const fines = GOLDEN_INPUT.fines.map(f => ({ ...f, overageTco2e: 0, annualFineUsd: 0, compliant: true, actualEmissionsTco2e: f.emissionsLimitTco2e }));
    const plan = optimizeRetrofit({ ...GOLDEN_INPUT, fines }, GOLDEN_MEASURES, GOLDEN_REBATES);
    expect(plan.chosenMeasureKeys).toEqual([]);
    expect(plan.capexUSD).toBe(0);
  });
});
```
- [ ] 2.2 Run `npx vitest run lib/optimize/retrofit.test.ts` — **expect FAIL** (no implementation).
- [ ] 2.3 Implement `lib/optimize/retrofit.ts` (complete, no placeholders):
```ts
import type { FineResult, Period } from "@/lib/ll97/engine";
import { PERIODS } from "@/lib/ll97/engine";
import type { Measure, RebateProgram, MatchedRebate } from "@/data/catalogs/types";

export interface MaccPoint { measureKey: string; name: string; tCO2eReduced: number; netCostUSD: number | null; costPerTonUSD: number | null; }
export interface ScheduledMeasure { measureKey: string; name: string; doByYear: number; }
export interface RetrofitPlan {
  chosenMeasureKeys: string[];
  capexUSD: number;
  totalFinesAvoidedUSD: number;
  tcoUSD: number;
  residualEmissionsTco2e: number;
  macc: MaccPoint[];
  schedule: ScheduledMeasure[];
  range: { tcoLowUSD: number; tcoHighUSD: number };
  matchedRebatesByMeasure: Record<string, MatchedRebate[]>;
}
export interface OptimizeInput {
  fines: FineResult[];
  fuels: string[];
  units: number | null;
  isMultifamily: boolean;
  affordable: boolean;
  targetPeriod?: Period;
}

const PENALTY_USD_PER_TON = 268;
const HORIZON_YEAR = 2050;

// Year span each period covers within the 2024..2050 modeling horizon.
const PERIOD_START: Record<Period, number> = { "2024-2029": 2024, "2030-2034": 2030, "2035-2039": 2035 };
const PERIOD_END: Record<Period, number> = { "2024-2029": 2029, "2030-2034": 2034, "2035-2039": HORIZON_YEAR };
function periodYears(p: Period): number { return PERIOD_END[p] - PERIOD_START[p] + 1; }

// Pluggable energy term — 0 until a verified $/measure figure exists (see plan Task 1).
function energyDeltaUSD(_measureKey: string): number { return 0; }

function measureApplies(m: Measure, fuels: string[]): boolean {
  return m.appliesToFuel.includes("any") || m.appliesToFuel.some(f => fuels.includes(f));
}
const isAffordableOnly = (r: RebateProgram) => r.incomeRestricted === true;
const isCash = (r: RebateProgram) => (r.amountNumericMaxUSD ?? 0) > 0 && r.cashEligible !== false && r.asOfRight !== false;

function compactRebateAmount(r: RebateProgram): string {
  const n = r.amountNumericMaxUSD;
  if (n == null) return /free|advisor/i.test(`${r.name} ${r.amount}`) ? "free" : "varies";
  const d = n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  return `up to ${d}/unit`;
}

function matchRebates(m: Measure, rebates: RebateProgram[], ctx: { isMultifamily: boolean; affordable: boolean }): RebateProgram[] {
  return rebates.filter(r =>
    r.status !== "expired" &&
    r.measures.includes(m.key) &&
    r.appliesToMultifamily === ctx.isMultifamily &&
    (ctx.affordable || !isAffordableOnly(r)));
}

interface Ctx { units: number | null; isMultifamily: boolean; affordable: boolean; fuels: string[]; }

/** Net capex for a single measure: perUnitCost×units − bestPerUnitCashRebate×units (floored at 0). null if uncostable. */
function netCapex(m: Measure, rebates: RebateProgram[], ctx: Ctx): number | null {
  if (ctx.units == null || m.typicalCostPerUnitUSDMax == null) return null;
  const gross = m.typicalCostPerUnitUSDMax * ctx.units;
  const matched = matchRebates(m, rebates, ctx).filter(isCash);
  const bestPerUnit = matched.reduce((mx, r) => Math.max(mx, r.amountNumericMaxUSD ?? 0), 0);
  return Math.max(0, gross - bestPerUnit * ctx.units);
}

/** Reduction fraction used for point estimate (mid) / Low / High. */
type RedMode = "mid" | "low" | "high";
function reductionPct(m: Measure, mode: RedMode): number {
  if (mode === "low") return m.emissionsReductionPctLow / 100;
  if (mode === "high") return m.emissionsReductionPctHigh / 100;
  return (m.emissionsReductionPctLow + m.emissionsReductionPctHigh) / 200;
}

export function buildMacc(baseEmissions: number, measures: Measure[], rebates: RebateProgram[], ctx: Ctx): MaccPoint[] {
  const points = measures.filter(m => measureApplies(m, ctx.fuels)).map(m => {
    const tons = baseEmissions * reductionPct(m, "mid");
    const net = netCapex(m, rebates, ctx);
    const cpt = net != null && tons > 0 ? net / tons : null;
    return { measureKey: m.key, name: m.name, tCO2eReduced: tons, netCostUSD: net, costPerTonUSD: cpt };
  });
  return points.sort((a, b) => (a.costPerTonUSD ?? Infinity) - (b.costPerTonUSD ?? Infinity));
}

/** Residual emissions after compounding a subset's reductions on the base (order-independent). */
function residualEmissions(base: number, subset: Measure[], mode: RedMode): number {
  return subset.reduce((e, m) => e * (1 - reductionPct(m, mode)), base);
}

/** Σ residual annual fines from 2024..2050, given residual emissions re-fined against each period's limit. */
function residualFinesToHorizon(residual: number, fines: FineResult[]): number {
  let total = 0;
  for (const f of fines) {
    const overage = Math.max(0, residual - f.emissionsLimitTco2e);
    total += overage * PENALTY_USD_PER_TON * periodYears(f.period);
  }
  return total;
}

function subsetCapex(subset: Measure[], rebates: RebateProgram[], ctx: Ctx): number {
  return subset.reduce((sum, m) => sum + (netCapex(m, rebates, ctx) ?? 0), 0);
}
function subsetEnergy(subset: Measure[]): number {
  return subset.reduce((sum, m) => sum + energyDeltaUSD(m.key), 0);
}

function tcoForSubset(base: number, subset: Measure[], fines: FineResult[], rebates: RebateProgram[], ctx: Ctx, mode: RedMode): number {
  const residual = residualEmissions(base, subset, mode);
  return subsetCapex(subset, rebates, ctx) + residualFinesToHorizon(residual, fines) + subsetEnergy(subset);
}

/** Enumerate all 2^N subsets; return the min-TCO subset meeting the target-period limit (point/mid estimate). */
function bestSubset(base: number, eligible: Measure[], fines: FineResult[], rebates: RebateProgram[], ctx: Ctx, targetLimit: number, mode: RedMode): { subset: Measure[]; tco: number } {
  const n = eligible.length;
  let best: { subset: Measure[]; tco: number } | null = null;
  for (let mask = 0; mask < (1 << n); mask++) {
    const subset = eligible.filter((_, i) => (mask & (1 << i)) !== 0);
    const residual = residualEmissions(base, subset, mode);
    if (residual > targetLimit + 1e-9) continue; // must meet the target-period limit
    const tco = tcoForSubset(base, subset, fines, rebates, ctx, mode);
    if (best == null || tco < best.tco) best = { subset, tco };
  }
  // If nothing meets the limit (impossible target), fall back to the all-measures subset.
  if (best == null) {
    const subset = eligible;
    best = { subset, tco: tcoForSubset(base, subset, fines, rebates, ctx, mode) };
  }
  return best;
}

export function optimizeRetrofit(input: OptimizeInput, measures: Measure[], rebates: RebateProgram[]): RetrofitPlan {
  const targetPeriod: Period = input.targetPeriod ?? "2030-2034";
  const ctx: Ctx = { units: input.units, isMultifamily: input.isMultifamily, affordable: input.affordable, fuels: input.fuels };
  const byPeriod = new Map<Period, FineResult>(input.fines.map(f => [f.period, f]));
  const targetFine = byPeriod.get(targetPeriod);
  const base = targetFine?.actualEmissionsTco2e ?? input.fines[0]?.actualEmissionsTco2e ?? 0;
  const targetLimit = targetFine?.emissionsLimitTco2e ?? base;
  const eligible = measures.filter(m => measureApplies(m, ctx.fuels));

  const macc = buildMacc(base, measures, rebates, ctx);

  const { subset: chosen, tco } = bestSubset(base, eligible, input.fines, rebates, ctx, targetLimit, "mid");
  const chosenKeys = new Set(chosen.map(m => m.key));

  const capexUSD = subsetCapex(chosen, rebates, ctx);
  const residual2030 = residualEmissions(base, chosen, "mid"); // 2030-2034 basis = residual is period-independent here
  // do-nothing baseline fines, point estimate
  const doNothingFines = residualFinesToHorizon(base, input.fines);
  const chosenFines = residualFinesToHorizon(residual2030, input.fines);
  const totalFinesAvoidedUSD = doNothingFines - chosenFines;

  // Schedule: chosen measures ordered by MACC ascending, all placed before the 2030 cliff.
  const schedule: ScheduledMeasure[] = macc
    .filter(p => chosenKeys.has(p.measureKey))
    .map((p, i) => ({ measureKey: p.measureKey, name: p.name, doByYear: 2027 + Math.min(i, 2) <= 2029 ? Math.min(2027 + i, 2029) : 2029 }));

  // Uncertainty: re-run the optimizer at Low and High reduction %, keep the chosen subset, recompute TCO.
  const tcoLow = tcoForSubset(base, chosen, input.fines, rebates, ctx, "low");   // less reduction → higher fines → higher TCO
  const tcoHigh = tcoForSubset(base, chosen, input.fines, rebates, ctx, "high"); // more reduction → lower fines → lower TCO
  const range = { tcoLowUSD: Math.min(tco, tcoLow, tcoHigh), tcoHighUSD: Math.max(tco, tcoLow, tcoHigh) };

  const matchedRebatesByMeasure: Record<string, MatchedRebate[]> = {};
  for (const m of chosen) {
    matchedRebatesByMeasure[m.key] = matchRebates(m, rebates, ctx).map(r => ({
      name: r.name, amount: r.amount, amountShort: compactRebateAmount(r), url: r.url,
    }));
  }

  return {
    chosenMeasureKeys: chosen.map(m => m.key),
    capexUSD,
    totalFinesAvoidedUSD,
    tcoUSD: tco,
    residualEmissionsTco2e: residual2030,
    macc,
    schedule,
    range,
    matchedRebatesByMeasure,
  };
}
```
> Note on `range`: `tcoLow`/`tcoHigh` are the TCO at the Low/High reduction bounds; we take min/max so `tcoLowUSD ≤ point ≤ tcoHighUSD` holds regardless of which bound is cheaper. The golden `range` test only asserts bracketing, so the exact bounds need no hand figure.
> Note on `schedule.doByYear`: chosen measures are placed at 2027, 2028, 2029 (capped at 2029 — before the 2030 cliff). The golden test asserts MACC order and `doByYear ≤ 2029`.
- [ ] 2.4 Run `npx vitest run lib/optimize/macc.test.ts lib/optimize/retrofit.test.ts` — **expect PASS** (all golden assertions green).
- [ ] 2.5 `npx tsc --noEmit` — expect no errors.
- [ ] 2.6 Commit: `git add lib/optimize/retrofit.ts lib/optimize/retrofit.test.ts && git commit -m "feat(optimize): exact 2^N retrofit optimizer — MACC, schedule, TCO, uncertainty range"` (with trailer).

---

## Task 3 — Remake `lib/advise/roi.ts` (FixCandidate[] + rebate match + payback)

**Files**
- Create: `lib/advise/roi.ts`
- Test: `lib/advise/roi.test.ts`

`FixCandidate` is defined in the contract under `lib/ai/advise.ts`. `roi.ts` builds the array from the engine's `FineResult[]` (plan period) + catalogs. Numbers only; `rationale` is filled later by Claude.

### Steps
- [ ] 3.1 Create `lib/advise/roi.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeCandidateFixes } from "@/lib/advise/roi";
import { GOLDEN_FINES, GOLDEN_MEASURES, GOLDEN_REBATES } from "@/lib/optimize/fixtures";

const ctx = { units: 100, isMultifamily: true, affordable: false, fuels: ["gas"] };

describe("computeCandidateFixes", () => {
  const fixes = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, GOLDEN_REBATES, "2030-2034", ctx);

  it("returns one candidate per fuel-applicable measure", () => {
    expect(fixes.map(f => f.measureKey).sort()).toEqual(["controls", "heat-pump", "lighting"]);
  });
  it("computes tCO2eReduced as mid-pct of plan-period emissions (1000)", () => {
    const hp = fixes.find(f => f.measureKey === "heat-pump")!;
    expect(hp.tCO2eReduced).toBeCloseTo(500, 6); // 1000 × 0.50
  });
  it("bounds avoided fine by the plan-period overage (600 tCO2e)", () => {
    const hp = fixes.find(f => f.measureKey === "heat-pump")!;
    // min(500, 600) × 268 = 134,000
    expect(hp.fineAvoidedUSD).toBeCloseTo(134000, 2);
  });
  it("nets the single best per-unit cash rebate, scaled by units", () => {
    const hp = fixes.find(f => f.measureKey === "heat-pump")!;
    // gross 30,000×100 = 3,000,000; rebate 5,000×100 = 500,000; net 2,500,000
    expect(hp.grossCostUSD).toBe(3000000);
    expect(hp.netCostUSD).toBe(2500000);
    expect(hp.matchedRebates[0].amountShort).toMatch(/\$5k\/unit/);
  });
  it("computes payback = netCost / annual avoided fine", () => {
    const hp = fixes.find(f => f.measureKey === "heat-pump")!;
    expect(hp.paybackYears).toBeCloseTo(2500000 / 134000, 4);
  });
  it("sorts by payback ascending (cheapest-to-pay-back first)", () => {
    const paybacks = fixes.map(f => f.paybackYears ?? Infinity);
    expect([...paybacks]).toEqual([...paybacks].sort((a, b) => a - b));
  });
  it("nulls unit-scaled costs when units is null", () => {
    const f2 = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, GOLDEN_REBATES, "2030-2034", { ...ctx, units: null });
    const hp = f2.find(f => f.measureKey === "heat-pump")!;
    expect(hp.grossCostUSD).toBeNull();
    expect(hp.netCostUSD).toBeNull();
    expect(hp.paybackYears).toBeNull();
  });
});
```
- [ ] 3.2 Run `npx vitest run lib/advise/roi.test.ts` — **expect FAIL**.
- [ ] 3.3 Implement `lib/advise/roi.ts`:
```ts
import type { FineResult, Period } from "@/lib/ll97/engine";
import type { Measure, RebateProgram, MatchedRebate } from "@/data/catalogs/types";
import type { FixCandidate } from "@/lib/ai/advise";

const PENALTY_USD_PER_TON = 268;

export interface RoiContext { units: number | null; isMultifamily: boolean; affordable: boolean; fuels: string[]; }

function applies(m: Measure, fuels: string[]): boolean {
  return m.appliesToFuel.includes("any") || m.appliesToFuel.some(f => fuels.includes(f));
}
const isAffordableOnly = (r: RebateProgram) => r.incomeRestricted === true;
const isCash = (r: RebateProgram) => (r.amountNumericMaxUSD ?? 0) > 0 && r.cashEligible !== false && r.asOfRight !== false;

function compactRebateAmount(r: RebateProgram): string {
  const n = r.amountNumericMaxUSD;
  if (n == null) return /free|advisor/i.test(`${r.name} ${r.amount}`) ? "free" : "varies";
  const d = n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  return `up to ${d}/unit`;
}

/**
 * Build ranked retrofit candidates from the engine's FineResult[] for the given plan period.
 * Every number is code-computed. Net cost uses a SINGLE best per-unit cash rebate × units.
 * Each measure's avoided fine is standalone (bounded by the period overage; not additive).
 */
export function computeCandidateFixes(
  fines: FineResult[], measures: Measure[], rebates: RebateProgram[],
  planPeriod: Period, ctx: RoiContext,
): FixCandidate[] {
  const period = fines.find(f => f.period === planPeriod) ?? fines[0];
  const emissions = period?.actualEmissionsTco2e ?? 0;
  const overage = period?.overageTco2e ?? 0;
  const units = ctx.units;

  const candidates: FixCandidate[] = measures.filter(m => applies(m, ctx.fuels)).map(m => {
    const midPct = (m.emissionsReductionPctLow + m.emissionsReductionPctHigh) / 2;
    const tCO2eReduced = emissions * (midPct / 100);
    const fineAvoidedUSD = Math.min(tCO2eReduced, overage) * PENALTY_USD_PER_TON;

    const matched = rebates.filter(r =>
      r.status !== "expired" &&
      r.measures.includes(m.key) &&
      r.appliesToMultifamily === ctx.isMultifamily &&
      (ctx.affordable || !isAffordableOnly(r)));
    const matchedRebates: MatchedRebate[] = matched.map(r => ({ name: r.name, amount: r.amount, amountShort: compactRebateAmount(r), url: r.url }));

    const bestPerUnitRebate = matched.filter(isCash).reduce((mx, r) => Math.max(mx, r.amountNumericMaxUSD ?? 0), 0);
    const grossCostUSD = (units != null && m.typicalCostPerUnitUSDMax != null) ? m.typicalCostPerUnitUSDMax * units : null;
    const rebateValueUSD = units != null ? bestPerUnitRebate * units : 0;
    const netCostUSD = grossCostUSD != null ? Math.max(0, grossCostUSD - rebateValueUSD) : null;
    const paybackYears = netCostUSD != null && fineAvoidedUSD > 0 ? netCostUSD / fineAvoidedUSD : null;

    return { measureKey: m.key, measure: m.name, tCO2eReduced, grossCostUSD, matchedRebates, netCostUSD, paybackYears, fineAvoidedUSD };
  });

  return candidates.sort((x, y) => {
    const px = x.paybackYears ?? Infinity, py = y.paybackYears ?? Infinity;
    if (px !== py) return px - py;
    return y.fineAvoidedUSD - x.fineAvoidedUSD;
  });
}
```
- [ ] 3.4 Run `npx vitest run lib/advise/roi.test.ts` — **expect PASS**.
- [ ] 3.5 Commit: `git add lib/advise/roi.ts lib/advise/roi.test.ts && git commit -m "feat(advise): remade roi.ts — code-computed FixCandidate[] with rebate match + payback"` (with trailer).

---

## Task 4 — Remake `lib/ai/advise.ts` (Claude orders + explains; deterministic fallback)

**Files**
- Create: `lib/ai/advise.ts`
- Test: `lib/ai/advise.test.ts`

Mirrors the verified pattern from the seed repo: model `claude-opus-4-8`, `output_config: { effort, format: { type: "json_schema", schema } }`, structured order + rationales merged onto code-computed candidates. The client is **injectable** so tests run without a key or network.

### Steps
- [ ] 4.1 Create `lib/ai/advise.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { generateAdvice, mergeRanking, type FixCandidate, type AdvicePlan } from "@/lib/ai/advise";
import { GOLDEN_FINES } from "@/lib/optimize/fixtures";
import type { BuildingFacts } from "@/lib/data/types";

const facts: BuildingFacts = {
  bbl: "1000010001", address: "1 Test Ave", grossFloorAreaSqft: 100000,
  occupancyGroups: [{ group: "Multifamily Housing", sqft: 100000 }],
  annualEmissionsTco2e: 1000, isLl97Covered: true, isArticle321: false, provenance: [],
};
const candidates: FixCandidate[] = [
  { measureKey: "lighting", measure: "Lighting", tCO2eReduced: 50, grossCostUSD: 20000, matchedRebates: [], netCostUSD: 20000, paybackYears: 0.7, fineAvoidedUSD: 13400 },
  { measureKey: "heat-pump", measure: "Heat pump", tCO2eReduced: 500, grossCostUSD: 3000000, matchedRebates: [], netCostUSD: 2500000, paybackYears: 18.7, fineAvoidedUSD: 134000 },
];

describe("mergeRanking", () => {
  it("applies order, attaches rationales, and includes every candidate exactly once", () => {
    const ranked = mergeRanking(candidates, ["heat-pump", "lighting"], new Map([["heat-pump", "electrify first"]]));
    expect(ranked.map(c => c.measureKey)).toEqual(["heat-pump", "lighting"]);
    expect(ranked[0].rationale).toBe("electrify first");
    expect(ranked).toHaveLength(2);
  });
  it("appends unranked candidates and never duplicates", () => {
    const ranked = mergeRanking(candidates, ["heat-pump"], new Map());
    expect(ranked.map(c => c.measureKey)).toEqual(["heat-pump", "lighting"]);
  });
});

describe("generateAdvice fallback (no client)", () => {
  it("returns source:'fallback' with templated explainer and unmodified candidates", async () => {
    const plan = await generateAdvice(facts, GOLDEN_FINES, candidates, "2030-2034", { client: null });
    expect(plan.source).toBe("fallback");
    expect(plan.rankedFixes).toHaveLength(2);
    expect(plan.rankedFixes[0].fineAvoidedUSD).toBe(candidates[0].fineAvoidedUSD); // numbers untouched
    expect(plan.explainer).toMatch(/2030/);
  });
});

describe("generateAdvice with injected mock client", () => {
  it("uses Claude's order + prose but never alters numbers", async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({
            explainer: "Your building faces a 2030 cliff.",
            boardSummary: "Electrify, then trim.",
            order: ["heat-pump", "lighting"],
            rationales: [{ measureKey: "heat-pump", rationale: "grid greens; gas does not" }],
          }) }],
        }),
      },
    };
    const plan = await generateAdvice(facts, GOLDEN_FINES, candidates, "2030-2034", { client: mockClient as any });
    expect(plan.source).toBe("ai");
    expect(plan.rankedFixes.map(c => c.measureKey)).toEqual(["heat-pump", "lighting"]);
    expect(plan.rankedFixes[0].rationale).toMatch(/grid greens/);
    expect(plan.rankedFixes[0].netCostUSD).toBe(2500000); // unchanged by the model
    expect(plan.explainer).toMatch(/cliff/);
    expect(mockClient.messages.create).toHaveBeenCalledOnce();
  });

  it("falls back to deterministic plan when the client throws", async () => {
    const mockClient = { messages: { create: vi.fn().mockRejectedValue(new Error("network")) } };
    const plan = await generateAdvice(facts, GOLDEN_FINES, candidates, "2030-2034", { client: mockClient as any });
    expect(plan.source).toBe("fallback");
    expect(plan.rankedFixes).toHaveLength(2);
  });
});
```
- [ ] 4.2 Run `npx vitest run lib/ai/advise.test.ts` — **expect FAIL**.
- [ ] 4.3 Implement `lib/ai/advise.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import type { FineResult, Period } from "@/lib/ll97/engine";
import type { BuildingFacts } from "@/lib/data/types";
import type { MatchedRebate } from "@/data/catalogs/types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

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

// Minimal structural type so a mock client satisfies the dependency without the full SDK shape.
interface MessagesClient { messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> }; }
export interface AdviseDeps { client?: MessagesClient | null; }

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    explainer: { type: "string", description: "plain-English explanation of the building's LL97 situation for a non-expert board member" },
    boardSummary: { type: "string", description: "one-paragraph summary a co-op/condo board can act on" },
    order: { type: "array", items: { type: "string" }, description: "measureKeys in recommended priority order" },
    rationales: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { measureKey: { type: "string" }, rationale: { type: "string" } }, required: ["measureKey", "rationale"] } },
  },
  required: ["explainer", "boardSummary", "order", "rationales"],
};

const SYSTEM = `You are an LL97 retrofit advisor for non-expert NYC building boards and small landlords.
The emissions, fines, costs, rebates, and payback you are given are AUTHORITATIVE and computed externally — NEVER recompute, restate differently, or alter any number; only reference them.
Rank the provided fixes for THIS building, weighting electrification (heat pumps) because LL97's grid-electricity emissions coefficient drops toward zero by 2040 while gas and oil stay flat forever.
Write in plain language a resident board member understands. Be honest that figures are estimates.`;

function planFineFor(fines: FineResult[], planPeriod: Period): number {
  return Math.round(fines.find(f => f.period === planPeriod)?.annualFineUsd ?? 0);
}

function fallbackPlan(facts: BuildingFacts, fines: FineResult[], candidates: FixCandidate[], planPeriod: Period): AdvicePlan {
  const currentFine = Math.round(fines.find(f => f.period === "2024-2029")?.annualFineUsd ?? 0);
  const planFine = planFineFor(fines, planPeriod);
  const explainer = planFine > 0
    ? `${currentFine > 0
        ? `Your building is over its Local Law 97 carbon cap and faces an estimated $${currentFine.toLocaleString()}/year penalty today`
        : `Your building meets its Local Law 97 cap today`}. The cap tightens sharply in 2030 — the penalty rises to about $${planFine.toLocaleString()}/year. The fixes below are ranked by payback against that ${planPeriod} cap, which is where retrofits start paying for themselves.`
    : `Your building meets its Local Law 97 cap through ${planPeriod}. The measures below help keep it compliant as limits tighten and cut energy costs.`;
  return { explainer, boardSummary: explainer, rankedFixes: candidates, source: "fallback", planPeriod, planPeriodFineUSD: planFine };
}

/** Apply Claude's order to candidates, attaching rationales; every candidate appears EXACTLY ONCE. Dedupe by measureKey. */
export function mergeRanking(candidates: FixCandidate[], order: string[], rationales: Map<string, string>): FixCandidate[] {
  const byKey = new Map(candidates.map(c => [c.measureKey, c]));
  const ranked: FixCandidate[] = [];
  const used = new Set<string>();
  for (const k of order) {
    const c = byKey.get(k);
    if (c && !used.has(c.measureKey)) { ranked.push({ ...c, rationale: rationales.get(k) }); used.add(c.measureKey); }
  }
  for (const c of candidates) {
    if (!used.has(c.measureKey)) { ranked.push({ ...c, rationale: rationales.get(c.measureKey) }); used.add(c.measureKey); }
  }
  return ranked;
}

/** Rank + explain via Claude; numbers come from `candidates` unchanged. Fallback with no key/client or on error. */
export async function generateAdvice(
  facts: BuildingFacts, fines: FineResult[], candidates: FixCandidate[],
  planPeriod: Period = "2030-2034", deps: AdviseDeps = {},
): Promise<AdvicePlan> {
  // Resolve the client: explicit deps.client wins; else construct a real one if a key is present; else fallback.
  const client: MessagesClient | null =
    deps.client !== undefined ? deps.client : (process.env.ANTHROPIC_API_KEY ? (new Anthropic() as unknown as MessagesClient) : null);
  if (!client || candidates.length === 0) return fallbackPlan(facts, fines, candidates, planPeriod);

  try {
    const currentFine = Math.round(fines.find(f => f.period === "2024-2029")?.annualFineUsd ?? 0);
    const planFine = planFineFor(fines, planPeriod);
    const user = `Building: ${facts.address}, ${(facts.grossFloorAreaSqft ?? 0).toLocaleString()} sq ft.
Current 2024-2029 fine: $${currentFine.toLocaleString()}/yr. The LL97 cap tightens in 2030: the ${planPeriod} fine is $${planFine.toLocaleString()}/yr.
The fix-it plan economics below (tCO2eReduced, fineAvoidedUSD, paybackYears) are computed against the ${planPeriod} cap — make clear the payoff is driven by the 2030 cliff, not the small current fine. Each fix's avoided fine is standalone (they do not add up).
Candidate fixes (numbers are final — do not change them):
${JSON.stringify(candidates.map(c => ({ measureKey: c.measureKey, measure: c.measure, tCO2eReduced: Math.round(c.tCO2eReduced), netCostUSD: c.netCostUSD, paybackYears: c.paybackYears, fineAvoidedUSD: Math.round(c.fineAvoidedUSD), rebates: c.matchedRebates.map(r => r.name) })), null, 2)}
Return: explainer, boardSummary, the recommended order (measureKeys), and a one-sentence rationale per measureKey.`;

    const res = await client.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: user }],
    });
    const textBlock = res.content.find(b => b.type === "text");
    const parsed = JSON.parse(textBlock?.text ?? "{}");
    const order: string[] = Array.isArray(parsed.order) ? parsed.order : [];
    const rats = new Map<string, string>((parsed.rationales ?? []).map((r: { measureKey: string; rationale: string }) => [r.measureKey, r.rationale]));
    const ranked = mergeRanking(candidates, order, rats);
    return { explainer: String(parsed.explainer ?? ""), boardSummary: String(parsed.boardSummary ?? ""), rankedFixes: ranked, source: "ai", planPeriod, planPeriodFineUSD: planFine };
  } catch {
    return fallbackPlan(facts, fines, candidates, planPeriod);
  }
}
```
> The mock-client test passes a plain object as `deps.client`; the structural `MessagesClient` interface admits it without the real SDK. With no key and `deps.client` undefined, the constructor is never reached and the fallback runs — so the test suite needs no API key.
- [ ] 4.4 Run `npx vitest run lib/ai/advise.test.ts` — **expect PASS**.
- [ ] 4.5 `npx tsc --noEmit` — expect clean.
- [ ] 4.6 Commit: `git add lib/ai/advise.ts lib/ai/advise.test.ts && git commit -m "feat(ai): remade advise.ts — Claude orders code-computed fixes (opus-4-8, structured output) + fallback"` (with trailer).

---

## Task 5 — RAG corpus (curated LL97 / Article 320-321 / DOB rule chunks)

**Files**
- Create: `lib/rag/corpus/ll97-statute.md`
- Create: `lib/rag/corpus/article-320-321.md`
- Create: `lib/rag/corpus/good-faith-efforts.md`
- Create: `lib/rag/corpus/penalty-and-limits.md`
- Create: `lib/rag/corpus/index.ts` (loads chunks at module init)

Each `.md` file is a set of chunks separated by a `---` line. Each chunk begins with a `SOURCE:` header line carrying a real source URL and a short title, then the rule text. The loader splits on `---`, parses the header, and yields `{ id, source, url, text }`.

### Steps
- [ ] 5.1 Create `lib/rag/corpus/ll97-statute.md`:
```markdown
SOURCE: NYC Local Law 97 of 2019 — Administrative Code §28-320 (building emissions limits) | https://www.nyc.gov/site/buildings/codes/local-law-97.page
Local Law 97, codified at NYC Administrative Code Article 320, sets annual greenhouse-gas emissions limits for most buildings over 25,000 gross square feet. Limits apply in compliance periods: the first runs 2024 through 2029, the second 2030 through 2034, with successively stricter limits set to reach net-zero-aligned targets by 2050. A building's annual limit is the sum, across its occupancy/property-type uses, of an emissions-intensity factor (tCO2e per square foot) for that use multiplied by the floor area of that use.
---
SOURCE: 1 RCNY §103-14 — Building Emissions Calculation (ESPM property types & coefficients) | https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf
The DOB rule 1 RCNY §103-14 specifies the building-emissions calculation: emissions are computed from each energy source's consumption multiplied by a source-specific GHG coefficient, and limits are computed from EnergyStar Portfolio Manager (ESPM) property-type intensity factors. The electricity coefficient declines over time as the grid decarbonizes, while coefficients for natural gas and fuel oil remain effectively constant — making electrification disproportionately valuable for later compliance periods.
```
- [ ] 5.2 Create `lib/rag/corpus/article-320-321.md`:
```markdown
SOURCE: NYC Administrative Code §28-321 — Alternative compliance for rent-regulated & affordable housing (Article 321) | https://www.nyc.gov/site/buildings/codes/local-law-97.page
Article 321 (Administrative Code §28-321) is an alternative compliance pathway for certain buildings, including those with more than 35% rent-regulated units, income-restricted affordable housing, and certain other categories. Buildings on the Article 321 pathway are not subject to the Article 320 emissions-limit penalties; instead they must implement a prescribed list of energy-conservation measures (such as upgrading heating-system controls, insulating pipes, and weatherization) by the deadline. Eligibility depends on regulatory status that is not always provable from public datasets, so it must be confirmed by the owner.
---
SOURCE: NYC Accelerator / DOB — Who qualifies for the affordable-housing (prescriptive) pathway | https://accelerator.nyc/ll97
Whether a building qualifies for the affordable-housing prescriptive pathway under Article 321 turns on its housing program and rent-regulation status — for example, buildings where more than 35 percent of dwelling units are rent-regulated, HDFC affordable housing, or buildings participating in specified affordability programs. A building that qualifies follows the prescriptive measures list rather than meeting a numeric emissions cap, and does not incur the $268-per-excess-ton penalty.
```
- [ ] 5.3 Create `lib/rag/corpus/good-faith-efforts.md`:
```markdown
SOURCE: NYC Administrative Code §28-320.3.10 — Good-faith efforts & penalty mitigation | https://www.nyc.gov/site/buildings/codes/local-law-97.page
A "good-faith effort" under Local Law 97 refers to documented steps an owner takes toward compliance that DOB may consider when assessing penalties — for example, having filed required benchmarking and audits, applied for available financing or incentives, begun the design of decarbonization work, or be a building that has submitted a decarbonization plan. Demonstrating a good-faith effort does not erase the emissions limit, but it can be a basis for mitigated penalties where a building is making credible progress toward compliance rather than ignoring the law.
```
- [ ] 5.4 Create `lib/rag/corpus/penalty-and-limits.md`:
```markdown
SOURCE: NYC Administrative Code §28-320.6 — Civil penalty for exceeding the emissions limit | https://www.nyc.gov/site/buildings/codes/local-law-97.page
A building that exceeds its annual emissions limit is liable for a civil penalty of $268 for every metric ton of CO2-equivalent over the limit, assessed annually. The penalty equals 268 multiplied by the number of tons by which the building's reported annual emissions exceed its calculated limit for that compliance period; a building at or under its limit owes nothing.
---
SOURCE: NYC DOB — Compliance reports must be certified by a registered design professional | https://www.nyc.gov/site/buildings/codes/local-law-97.page
The official Local Law 97 compliance report must be prepared and certified by a registered design professional (a licensed professional engineer or registered architect). Estimates produced by third-party tools are useful for planning but are not a substitute for the certified report DOB requires.
```
- [ ] 5.5 Create `lib/rag/corpus/index.ts` (loader):
```ts
// Loads curated RAG chunks at module init. Each .md file is chunks separated by lines of exactly "---";
// each chunk's first line is "SOURCE: <title> | <url>", remaining lines are the rule text.
import ll97 from "./ll97-statute.md?raw";
import art from "./article-320-321.md?raw";
import gfe from "./good-faith-efforts.md?raw";
import pen from "./penalty-and-limits.md?raw";

export interface Chunk { id: string; source: string; url: string; text: string; }

function parseFile(raw: string, file: string): Chunk[] {
  return raw.split(/^---$/m).map(s => s.trim()).filter(Boolean).map((block, i) => {
    const nl = block.indexOf("\n");
    const header = (nl === -1 ? block : block.slice(0, nl)).trim();
    const text = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    const m = header.replace(/^SOURCE:\s*/i, "").split("|");
    const source = (m[0] ?? "").trim();
    const url = (m[1] ?? "").trim();
    return { id: `${file}#${i}`, source, url, text };
  });
}

export const CORPUS: Chunk[] = [
  ...parseFile(ll97, "ll97-statute"),
  ...parseFile(art, "article-320-321"),
  ...parseFile(gfe, "good-faith-efforts"),
  ...parseFile(pen, "penalty-and-limits"),
];
```
> The `?raw` import suffix is the bundler-native way to inline file contents as strings in Next 16 / Turbopack. If a Vitest run cannot resolve `?raw`, add to `vitest.config.ts`: `test: { server: { deps: { inline: [/\.md\?raw$/] } } }` and a tiny `assetFileNames`-free loader — but the simplest portable fallback is reading the files with `node:fs` at module load in `index.ts` (use `fs.readFileSync(new URL("./ll97-statute.md", import.meta.url), "utf8")`). Prefer `node:fs` here so tests and the server share one code path; switch the four imports to `readFileSync` calls if `?raw` is not wired up. Implement with `node:fs` to avoid bundler coupling.
- [ ] 5.6 Implement `index.ts` with `node:fs` reads (portable across Vitest + Next):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Chunk { id: string; source: string; url: string; text: string; }

function load(file: string): string {
  return readFileSync(fileURLToPath(new URL(`./${file}.md`, import.meta.url)), "utf8");
}
function parseFile(raw: string, file: string): Chunk[] {
  return raw.split(/^---$/m).map(s => s.trim()).filter(Boolean).map((block, i) => {
    const nl = block.indexOf("\n");
    const header = (nl === -1 ? block : block.slice(0, nl)).trim();
    const text = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    const parts = header.replace(/^SOURCE:\s*/i, "").split("|");
    return { id: `${file}#${i}`, source: (parts[0] ?? "").trim(), url: (parts[1] ?? "").trim(), text };
  });
}
export const CORPUS: Chunk[] = ["ll97-statute", "article-320-321", "good-faith-efforts", "penalty-and-limits"]
  .flatMap(f => parseFile(load(f), f));
```
- [ ] 5.7 No test yet for the corpus content (it is data); it is exercised by Task 6. Commit: `git add lib/rag/corpus && git commit -m "feat(rag): curated LL97/Article 321/DOB corpus chunks with source URLs"` (with trailer).

---

## Task 6 — BM25 retrieval (`lib/rag/retrieve.ts`, pure + tested)

**Files**
- Create: `lib/rag/retrieve.ts`
- Test: `lib/rag/retrieve.test.ts`

### Steps
- [ ] 6.1 Create `lib/rag/retrieve.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bm25Retrieve, tokenize } from "@/lib/rag/retrieve";
import { CORPUS } from "@/lib/rag/corpus";

describe("tokenize", () => {
  it("lowercases, strips punctuation, drops stopwords", () => {
    expect(tokenize("Do I qualify for the affordable-housing pathway?")).toContain("affordable");
    expect(tokenize("Do I qualify for the affordable-housing pathway?")).not.toContain("the");
  });
});

describe("bm25Retrieve over the LL97 corpus", () => {
  it("ranks the Article 321 chunk top for an affordable-housing question", () => {
    const hits = bm25Retrieve("Do I qualify for the affordable-housing pathway?", CORPUS, 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.source.toLowerCase()).toMatch(/article 321|affordable|321/);
  });
  it("ranks the good-faith-efforts chunk top for that question", () => {
    const hits = bm25Retrieve("What is a good-faith effort under Local Law 97?", CORPUS, 3);
    expect(hits[0].chunk.text.toLowerCase()).toMatch(/good-faith|good faith/);
  });
  it("ranks the penalty chunk top for a penalty-rate question", () => {
    const hits = bm25Retrieve("How much is the fine per ton over the cap?", CORPUS, 3);
    expect(hits[0].chunk.text).toMatch(/268/);
  });
  it("returns at most k results, descending by score", () => {
    const hits = bm25Retrieve("emissions limit", CORPUS, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
  });
  it("returns empty for a query with no corpus term overlap", () => {
    expect(bm25Retrieve("xylophone bicycle quasar", CORPUS, 3)).toEqual([]);
  });
});
```
- [ ] 6.2 Run `npx vitest run lib/rag/retrieve.test.ts` — **expect FAIL**.
- [ ] 6.3 Implement `lib/rag/retrieve.ts` (textbook BM25, pure):
```ts
import type { Chunk } from "@/lib/rag/corpus";

const STOPWORDS = new Set("a an and are as at be by for from how i if in is it of on or that the to do you what when which who with your my".split(/\s+/));

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

export interface RetrievedChunk { chunk: Chunk; score: number; }

const K1 = 1.5, B = 0.75;

/** Pure BM25 ranking over the corpus; returns top-k with score > 0, descending. */
export function bm25Retrieve(query: string, corpus: Chunk[], k = 3): RetrievedChunk[] {
  const qTerms = tokenize(query);
  if (qTerms.length === 0 || corpus.length === 0) return [];

  const docs = corpus.map(c => tokenize(`${c.source} ${c.text}`));
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N;

  // document frequency per term
  const df = new Map<string, number>();
  for (const term of new Set(qTerms)) {
    df.set(term, docs.filter(d => d.includes(term)).length);
  }

  const scored = corpus.map((chunk, i) => {
    const d = docs[i];
    const dl = d.length;
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of qTerms) {
      const n = df.get(term) ?? 0;
      if (n === 0) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); // BM25 idf (always positive form)
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (dl / avgdl)));
    }
    return { chunk, score };
  });

  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
```
- [ ] 6.4 Run `npx vitest run lib/rag/retrieve.test.ts` — **expect PASS**.
- [ ] 6.5 Commit: `git add lib/rag/retrieve.ts lib/rag/retrieve.test.ts && git commit -m "feat(rag): pure BM25 retrieval over the LL97 corpus"` (with trailer).

---

## Task 7 — `lib/ai/ask.ts` (RAG answer with citations; Claude cites + refuses; fallback)

**Files**
- Create: `lib/ai/ask.ts`
- Test: `lib/ai/ask.test.ts`

### Steps
- [ ] 7.1 Create `lib/ai/ask.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { answerLawQuestion, type RagAnswer } from "@/lib/ai/ask";

describe("answerLawQuestion fallback (no client)", () => {
  it("returns the top corpus chunks as citations for the affordable-housing question", async () => {
    const ans = await answerLawQuestion("Do I qualify for the affordable-housing pathway?", { client: null });
    expect(ans.citations.length).toBeGreaterThan(0);
    expect(ans.citations[0].source.toLowerCase()).toMatch(/321|affordable/);
    expect(ans.citations[0].url).toMatch(/^https?:\/\//);
    expect(ans.answer.length).toBeGreaterThan(0);
  });
  it("answers the good-faith-effort question from the corpus", async () => {
    const ans = await answerLawQuestion("What's a good-faith effort?", { client: null });
    expect(ans.citations.some(c => /good-faith|good faith/i.test(c.quote))).toBe(true);
  });
  it("refuses (no citations) when nothing in the corpus matches", async () => {
    const ans = await answerLawQuestion("What is the boiling point of helium?", { client: null });
    expect(ans.citations).toEqual([]);
    expect(ans.answer).toMatch(/don'?t|cannot|not (in|covered)|outside/i);
  });
});

describe("answerLawQuestion with injected mock client", () => {
  it("passes retrieved chunks to Claude and returns its answer + citations", async () => {
    const mockClient = {
      messages: { create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({
          answer: "Buildings with >35% rent-regulated units may use Article 321.",
          citations: [{ source: "NYC Administrative Code §28-321", url: "https://www.nyc.gov/site/buildings/codes/local-law-97.page", quote: "more than 35% rent-regulated units" }],
        }) }],
      }) },
    };
    const ans = await answerLawQuestion("Do I qualify for the affordable-housing pathway?", { client: mockClient as any });
    expect(ans.answer).toMatch(/35%/);
    expect(ans.citations[0].url).toMatch(/nyc\.gov/);
    expect(mockClient.messages.create).toHaveBeenCalledOnce();
  });
  it("falls back to top chunks when the client throws", async () => {
    const mockClient = { messages: { create: vi.fn().mockRejectedValue(new Error("down")) } };
    const ans = await answerLawQuestion("How much is the penalty per ton?", { client: mockClient as any });
    expect(ans.citations.length).toBeGreaterThan(0);
    expect(ans.citations[0].quote).toMatch(/268/);
  });
});
```
- [ ] 7.2 Run `npx vitest run lib/ai/ask.test.ts` — **expect FAIL**.
- [ ] 7.3 Implement `lib/ai/ask.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { CORPUS } from "@/lib/rag/corpus";
import { bm25Retrieve, type RetrievedChunk } from "@/lib/rag/retrieve";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const TOP_K = 3;

export interface Citation { source: string; url: string; quote: string; }
export interface RagAnswer { answer: string; citations: Citation[]; }

interface MessagesClient { messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> }; }
export interface AskDeps { client?: MessagesClient | null; }

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    answer: { type: "string", description: "plain-English answer grounded ONLY in the provided sources; if unsupported, say so" },
    citations: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { source: { type: "string" }, url: { type: "string" }, quote: { type: "string" } },
      required: ["source", "url", "quote"] } },
  },
  required: ["answer", "citations"],
};

const SYSTEM = `You answer questions about NYC Local Law 97 using ONLY the provided source excerpts.
Cite each claim with the source title, its URL, and a short verbatim quote from the excerpt that supports it.
If the provided sources do not answer the question, say you don't have that in the curated LL97 corpus and return an empty citations array. NEVER invent a source, URL, quote, or fact not present in the excerpts.`;

/** Build a fallback answer directly from the retrieved chunks (no model). */
function fallbackAnswer(hits: RetrievedChunk[]): RagAnswer {
  if (hits.length === 0) {
    return { answer: "I don't have that in the curated Local Law 97 corpus. Please verify against an official DOB source.", citations: [] };
  }
  const citations: Citation[] = hits.map(h => ({
    source: h.chunk.source, url: h.chunk.url,
    quote: h.chunk.text.split(/(?<=\.)\s/)[0].slice(0, 240), // first sentence as the quote
  }));
  const answer = `Based on the curated LL97 corpus: ${hits[0].chunk.text.split(/(?<=\.)\s/).slice(0, 2).join(" ")} (See the cited source; verify against the official text.)`;
  return { answer, citations };
}

export async function answerLawQuestion(question: string, deps: AskDeps = {}): Promise<RagAnswer> {
  const hits = bm25Retrieve(question, CORPUS, TOP_K);
  const client: MessagesClient | null =
    deps.client !== undefined ? deps.client : (process.env.ANTHROPIC_API_KEY ? (new Anthropic() as unknown as MessagesClient) : null);

  // No model OR nothing retrieved → deterministic path (which itself refuses when hits is empty).
  if (!client || hits.length === 0) return fallbackAnswer(hits);

  try {
    const sources = hits.map((h, i) => `[${i + 1}] ${h.chunk.source}\nURL: ${h.chunk.url}\nEXCERPT: ${h.chunk.text}`).join("\n\n");
    const user = `Question: ${question}\n\nSources:\n${sources}\n\nAnswer using only these sources; cite source title + URL + a short verbatim quote. If they don't answer the question, say so and return no citations.`;
    const res = await client.messages.create({
      model: MODEL, max_tokens: 8000, system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: user }],
    });
    const textBlock = res.content.find(b => b.type === "text");
    const parsed = JSON.parse(textBlock?.text ?? "{}");
    const citations: Citation[] = Array.isArray(parsed.citations)
      ? parsed.citations.map((c: Citation) => ({ source: String(c.source ?? ""), url: String(c.url ?? ""), quote: String(c.quote ?? "") }))
      : [];
    return { answer: String(parsed.answer ?? ""), citations };
  } catch {
    return fallbackAnswer(hits);
  }
}
```
- [ ] 7.4 Run `npx vitest run lib/ai/ask.test.ts` — **expect PASS**.
- [ ] 7.5 `npx tsc --noEmit` — expect clean.
- [ ] 7.6 Commit: `git add lib/ai/ask.ts lib/ai/ask.test.ts && git commit -m "feat(ai): RAG ask.ts — Claude cites the LL97 corpus + refuses; deterministic top-chunk fallback"` (with trailer).

---

## Task 8 — LLM response cache for the 3 demo buildings

**Files**
- Create: `data/cache/llm/README.md` (explains the format + how to regenerate)
- Create: `data/cache/llm/.gitkeep` (until populated)
- Create: `lib/ai/cache.ts` (read-through cache keyed by a stable hash)
- Test: `lib/ai/cache.test.ts`
- Create: `scripts/precompute-llm.ts` (one-shot: run advise + ask for the 3 demo buildings → write JSON)

The cache makes the demo deterministic and wifi-proof: `/api/advise` and `/api/ask` consult the cache before calling Claude. A cache hit returns the stored `AdvicePlan` / `RagAnswer` instantly with no network.

### Steps
- [ ] 8.1 Create `lib/ai/cache.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cacheKey, readCache, writeCache } from "@/lib/ai/cache";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

describe("llm cache", () => {
  const dir = mkdtempSync(join(tmpdir(), "llmcache-"));

  it("derives a stable key from the same input regardless of object key order", () => {
    expect(cacheKey({ a: 1, b: 2 })).toBe(cacheKey({ b: 2, a: 1 }));
    expect(cacheKey({ a: 1 })).not.toBe(cacheKey({ a: 2 }));
  });
  it("round-trips a value through write/read", () => {
    const key = cacheKey({ q: "penalty?" });
    expect(readCache(key, dir)).toBeNull();
    writeCache(key, { answer: "x", citations: [] }, dir);
    expect(readCache(key, dir)).toEqual({ answer: "x", citations: [] });
  });
  it("returns null for a missing key", () => {
    expect(readCache("doesnotexist", dir)).toBeNull();
  });
});
```
- [ ] 8.2 Run `npx vitest run lib/ai/cache.test.ts` — **expect FAIL**.
- [ ] 8.3 Implement `lib/ai/cache.ts`:
```ts
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_DIR = join(process.cwd(), "data", "cache", "llm");

/** Stable key: hash of canonical (sorted-key) JSON of the input. */
export function cacheKey(input: unknown): string {
  const canon = JSON.stringify(input, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v);
  return createHash("sha256").update(canon).digest("hex").slice(0, 32);
}

export function readCache<T>(key: string, dir = DEFAULT_DIR): T | null {
  const path = join(dir, `${key}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return null; }
}

export function writeCache(key: string, value: unknown, dir = DEFAULT_DIR): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.json`), JSON.stringify(value, null, 2));
}
```
- [ ] 8.4 Run `npx vitest run lib/ai/cache.test.ts` — **expect PASS**.
- [ ] 8.5 Create `scripts/precompute-llm.ts` (one-shot; uses the real client when a key is present, else stores the deterministic fallback so the demo is always populated):
```ts
/* Run with: npx tsx scripts/precompute-llm.ts
 * Populates data/cache/llm/*.json for the 3 demo buildings (advise) and the 2 demo questions (ask).
 * With ANTHROPIC_API_KEY set it stores Claude's real output; without, it stores the deterministic fallback. */
import { lookupBuilding } from "@/lib/data/lookup";
import { computeAllPeriods } from "@/lib/ll97/engine";
import { MEASURES } from "@/data/catalogs/measures";
import { REBATES } from "@/data/catalogs/rebates";
import { computeCandidateFixes } from "@/lib/advise/roi";
import { generateAdvice } from "@/lib/ai/advise";
import { answerLawQuestion } from "@/lib/ai/ask";
import { cacheKey, writeCache } from "@/lib/ai/cache";

const DEMO_ADDRESSES = [
  "350 5th Avenue, Manhattan",          // Empire State Building (market-rate)
  "1 Hanson Place, Brooklyn",           // large multifamily
  "55 Hope Street, Brooklyn",           // affordable-housing demo building
];
const DEMO_QUESTIONS = [
  "Do I qualify for the affordable-housing pathway?",
  "What's a good-faith effort?",
];

function fuelsFromFacts(): string[] { return ["gas"]; } // P0/P3 refine; gas is the safe default for the cache run

async function main() {
  for (const address of DEMO_ADDRESSES) {
    const facts = await lookupBuilding(address);
    if (facts.annualEmissionsTco2e == null || facts.grossFloorAreaSqft == null) continue;
    const fines = computeAllPeriods({
      grossFloorAreaSqft: facts.grossFloorAreaSqft,
      occupancyGroups: facts.occupancyGroups,
      annualEmissionsTco2e: facts.annualEmissionsTco2e,
      isArticle321: facts.isArticle321 ?? false,
    });
    const units = facts.grossFloorAreaSqft ? Math.max(1, Math.round(facts.grossFloorAreaSqft / 900)) : null;
    const ctx = { units, isMultifamily: true, affordable: !!facts.isArticle321, fuels: fuelsFromFacts() };
    const candidates = computeCandidateFixes(fines, MEASURES, REBATES, "2030-2034", ctx);
    const plan = await generateAdvice(facts, fines, candidates, "2030-2034");
    writeCache(cacheKey({ kind: "advise", bbl: facts.bbl, planPeriod: "2030-2034" }), plan);
    console.log(`cached advise: ${address} (${plan.source})`);
  }
  for (const q of DEMO_QUESTIONS) {
    const ans = await answerLawQuestion(q);
    writeCache(cacheKey({ kind: "ask", question: q }), ans);
    console.log(`cached ask: ${q}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
```
- [ ] 8.6 Create `data/cache/llm/README.md`:
```markdown
# Cached LLM responses (demo robustness)

`*.json` files are read-through cache entries for `/api/advise` and `/api/ask`, keyed by a 32-char
sha256 of the canonical request (see `lib/ai/cache.ts`). They let the demo run end-to-end with no
live network, and pin Claude's prose for the 3 demo buildings + 2 demo questions.

Regenerate: `npx tsx scripts/precompute-llm.ts` (uses `ANTHROPIC_API_KEY` if present; otherwise
stores the deterministic fallback, which still makes the demo populated and instant).
```
- [ ] 8.7 Commit: `git add lib/ai/cache.ts lib/ai/cache.test.ts scripts/precompute-llm.ts data/cache/llm && git commit -m "feat(ai): read-through LLM cache + precompute script for the 3 demo buildings"` (with trailer).

---

## Task 9 — API routes: `/api/advise`, `/api/optimize`, `/api/ask`

**Files**
- Create: `app/api/advise/route.ts`
- Create: `app/api/optimize/route.ts`
- Create: `app/api/ask/route.ts`
- Test: `app/api/routes.test.ts`

All routes return web-standard `Response.json(...)` (idiomatic Next 16). `/api/advise` and `/api/ask` consult the LLM cache first.

### Steps
- [ ] 9.1 Create `app/api/routes.test.ts` (POST handlers are plain async functions taking a `Request`; we call them directly):
```ts
import { describe, it, expect } from "vitest";
import { POST as advisePOST } from "@/app/api/advise/route";
import { POST as optimizePOST } from "@/app/api/optimize/route";
import { POST as askPOST } from "@/app/api/ask/route";
import { GOLDEN_FINES } from "@/lib/optimize/fixtures";
import type { BuildingFacts } from "@/lib/data/types";

const facts: BuildingFacts = {
  bbl: "1000010001", address: "1 Test Ave", grossFloorAreaSqft: 100000,
  occupancyGroups: [{ group: "Multifamily Housing", sqft: 100000 }],
  annualEmissionsTco2e: 1000, isLl97Covered: true, isArticle321: false, provenance: [],
};
function req(body: unknown) { return new Request("http://t/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }); }

describe("/api/optimize", () => {
  it("returns a RetrofitPlan with a MACC and chosen measures", async () => {
    const res = await optimizePOST(req({ facts, fines: GOLDEN_FINES }));
    const json = await res.json();
    expect(Array.isArray(json.macc)).toBe(true);
    expect(Array.isArray(json.chosenMeasureKeys)).toBe(true);
    expect(typeof json.tcoUSD).toBe("number");
  });
});

describe("/api/advise", () => {
  it("returns an AdvicePlan (fallback when no key) with ranked fixes", async () => {
    const res = await advisePOST(req({ facts, fines: GOLDEN_FINES, planPeriod: "2030-2034" }));
    const json = await res.json();
    expect(["ai", "fallback"]).toContain(json.source);
    expect(Array.isArray(json.rankedFixes)).toBe(true);
    expect(json.explainer.length).toBeGreaterThan(0);
  });
});

describe("/api/ask", () => {
  it("returns a RagAnswer with citations for an in-corpus question", async () => {
    const res = await askPOST(req({ question: "How much is the penalty per ton?" }));
    const json = await res.json();
    expect(json.citations[0].quote).toMatch(/268/);
  });
  it("400s on a missing question", async () => {
    const res = await askPOST(req({}));
    expect(res.status).toBe(400);
  });
});
```
- [ ] 9.2 Run `npx vitest run app/api/routes.test.ts` — **expect FAIL**.
- [ ] 9.3 Implement `app/api/optimize/route.ts`:
```ts
import type { BuildingFacts } from "@/lib/data/types";
import type { FineResult } from "@/lib/ll97/engine";
import { optimizeRetrofit, type OptimizeInput } from "@/lib/optimize/retrofit";
import { MEASURES } from "@/data/catalogs/measures";
import { REBATES } from "@/data/catalogs/rebates";

function fuelsFromFacts(_facts: BuildingFacts): string[] { return ["gas"]; } // refined by P3 ingestion; gas default

export async function POST(request: Request): Promise<Response> {
  const { facts, fines } = (await request.json()) as { facts: BuildingFacts; fines: FineResult[] };
  if (!facts || !Array.isArray(fines)) return Response.json({ error: "facts and fines are required" }, { status: 400 });
  const units = facts.grossFloorAreaSqft ? Math.max(1, Math.round(facts.grossFloorAreaSqft / 900)) : null;
  const input: OptimizeInput = {
    fines, fuels: fuelsFromFacts(facts), units, isMultifamily: true, affordable: !!facts.isArticle321, targetPeriod: "2030-2034",
  };
  return Response.json(optimizeRetrofit(input, MEASURES, REBATES));
}
```
- [ ] 9.4 Implement `app/api/advise/route.ts` (cache-first):
```ts
import type { BuildingFacts } from "@/lib/data/types";
import type { FineResult, Period } from "@/lib/ll97/engine";
import { computeCandidateFixes } from "@/lib/advise/roi";
import { generateAdvice, type AdvicePlan } from "@/lib/ai/advise";
import { MEASURES } from "@/data/catalogs/measures";
import { REBATES } from "@/data/catalogs/rebates";
import { cacheKey, readCache, writeCache } from "@/lib/ai/cache";

function fuelsFromFacts(_facts: BuildingFacts): string[] { return ["gas"]; }

export async function POST(request: Request): Promise<Response> {
  const { facts, fines, planPeriod } = (await request.json()) as { facts: BuildingFacts; fines: FineResult[]; planPeriod?: Period };
  if (!facts || !Array.isArray(fines)) return Response.json({ error: "facts and fines are required" }, { status: 400 });
  const period: Period = planPeriod ?? "2030-2034";

  const key = cacheKey({ kind: "advise", bbl: facts.bbl, planPeriod: period });
  const cached = readCache<AdvicePlan>(key);
  if (cached) return Response.json(cached);

  const units = facts.grossFloorAreaSqft ? Math.max(1, Math.round(facts.grossFloorAreaSqft / 900)) : null;
  const ctx = { units, isMultifamily: true, affordable: !!facts.isArticle321, fuels: fuelsFromFacts(facts) };
  const candidates = computeCandidateFixes(fines, MEASURES, REBATES, period, ctx);
  const plan = await generateAdvice(facts, fines, candidates, period);
  if (plan.source === "ai") writeCache(key, plan); // only persist real model output
  return Response.json(plan);
}
```
- [ ] 9.5 Implement `app/api/ask/route.ts` (cache-first):
```ts
import { answerLawQuestion, type RagAnswer } from "@/lib/ai/ask";
import { cacheKey, readCache, writeCache } from "@/lib/ai/cache";

export async function POST(request: Request): Promise<Response> {
  const { question } = (await request.json()) as { question?: string };
  if (!question || !question.trim()) return Response.json({ error: "question is required" }, { status: 400 });

  const key = cacheKey({ kind: "ask", question });
  const cached = readCache<RagAnswer>(key);
  if (cached) return Response.json(cached);

  const ans = await answerLawQuestion(question);
  if (ans.citations.length > 0) writeCache(key, ans); // persist answered (non-refusal) responses
  return Response.json(ans);
}
```
- [ ] 9.6 Run `npx vitest run app/api/routes.test.ts` — **expect PASS**.
- [ ] 9.7 `npx tsc --noEmit` — expect clean.
- [ ] 9.8 Commit: `git add app/api/advise app/api/optimize app/api/ask app/api/routes.test.ts && git commit -m "feat(api): advise/optimize/ask routes (Response.json, cache-first for advise+ask)"` (with trailer).

---

## Task 10 — UI: MaccChart, ScheduleTimeline, FinancingList, AskPanel (wired into the result view)

**Files**
- Create: `components/MaccChart.tsx`
- Create: `components/ScheduleTimeline.tsx`
- Create: `components/FinancingList.tsx`
- Create: `components/AskPanel.tsx`
- Modify: `app/page.tsx` (wire the four into the result view; fetch `/api/optimize` + `/api/advise`; mount AskPanel)
- Modify: `app/globals.css` (only if a new keyframe/token is needed; reuse `.fp-rise`/`.fp-pop`)

UI is verified by `npm run build` + headless-Chromium screenshots, not unit tests (per the spec). All numbers come from the API responses; components only render. Tailwind v4: `tabular-nums` on every number, animate transform/opacity only, `active:scale-[0.97]` for press feel, respect `prefers-reduced-motion` via `.fp-rise`/`.fp-pop`.

### Steps
- [ ] 10.1 Implement `components/MaccChart.tsx` — a Recharts bar chart of the MACC (x = measure, y = $/tCO2e), ascending, with a tooltip showing tons reduced and net cost:
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { MaccPoint } from "@/lib/optimize/retrofit";

export function MaccChart({ macc, chosen }: { macc: MaccPoint[]; chosen: string[] }) {
  const data = macc
    .filter(p => p.costPerTonUSD != null)
    .map(p => ({ name: p.name.split(" ").slice(0, 2).join(" "), key: p.measureKey, cost: Math.round(p.costPerTonUSD as number), tons: Math.round(p.tCO2eReduced) }));
  return (
    <div className="fp-rise">
      <h3 className="text-sm font-medium text-neutral-500 mb-2">Marginal abatement cost ($/tCO₂e)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(v: number, n) => n === "cost" ? [`$${v.toLocaleString()}/t`, "cost"] : [v, n]}
                   labelClassName="tabular-nums" />
          <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
            {data.map(d => <Cell key={d.key} fill={chosen.includes(d.key) ? "#16a34a" : "#cbd5e1"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-neutral-400 mt-1">Green bars are in the cost-optimal plan. Lower bars abate carbon more cheaply.</p>
    </div>
  );
}
```
- [ ] 10.2 Implement `components/ScheduleTimeline.tsx` — chosen measures ordered by MACC, each labeled with `doByYear`, with a "2030 cliff" marker:
```tsx
import type { ScheduledMeasure } from "@/lib/optimize/retrofit";

export function ScheduleTimeline({ schedule }: { schedule: ScheduledMeasure[] }) {
  if (schedule.length === 0) return <p className="text-sm text-neutral-500">Already compliant through 2030 — no measures scheduled.</p>;
  return (
    <ol className="fp-rise space-y-2">
      {schedule.map((s, i) => (
        <li key={s.measureKey} className="flex items-center gap-3">
          <span className="tabular-nums text-xs font-medium text-green-700 bg-green-50 rounded px-2 py-0.5">by {s.doByYear}</span>
          <span className="text-sm">{i + 1}. {s.name}</span>
        </li>
      ))}
      <li className="flex items-center gap-3 pt-1 border-t border-dashed border-red-200">
        <span className="tabular-nums text-xs font-medium text-red-700 bg-red-50 rounded px-2 py-0.5">2030</span>
        <span className="text-sm text-red-700">Cap tightens — penalties jump.</span>
      </li>
    </ol>
  );
}
```
- [ ] 10.3 Implement `components/FinancingList.tsx` — per-fix net cost, payback, and matched rebate pills (compact, no overflow):
```tsx
import type { FixCandidate } from "@/lib/ai/advise";

const fmtUSD = (n: number | null) => n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const fmtPb = (n: number | null) => n == null ? "—" : n > 50 ? ">50 yr" : `${n.toFixed(1)} yr`;

export function FinancingList({ fixes }: { fixes: FixCandidate[] }) {
  return (
    <ul className="fp-rise space-y-3">
      {fixes.map(f => (
        <li key={f.measureKey} className="rounded-lg border border-neutral-200 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{f.measure}</span>
            <span className="tabular-nums text-xs text-neutral-500">net {fmtUSD(f.netCostUSD)} · payback {fmtPb(f.paybackYears)}</span>
          </div>
          {f.rationale && <p className="text-xs text-neutral-600 mt-1">{f.rationale}</p>}
          {f.matchedRebates.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {f.matchedRebates.slice(0, 4).map(r => (
                <a key={r.name} href={r.url} target="_blank" rel="noreferrer"
                   className="tabular-nums text-[11px] bg-green-50 text-green-800 rounded-full px-2 py-0.5 hover:bg-green-100 active:scale-[0.97] transition-transform"
                   title={r.name}>{r.amountShort}</a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```
- [ ] 10.4 Implement `components/AskPanel.tsx` — a question box that POSTs `/api/ask` and renders the answer with visible citation links:
```tsx
"use client";
import { useState } from "react";
import type { RagAnswer } from "@/lib/ai/ask";

const EXAMPLES = ["Do I qualify for the affordable-housing pathway?", "What's a good-faith effort?", "How much is the penalty per ton?"];

export function AskPanel() {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<RagAnswer | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(question: string) {
    setQ(question); setLoading(true); setAns(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      setAns(await res.json());
    } finally { setLoading(false); }
  }

  return (
    <section className="fp-rise">
      <h3 className="text-sm font-medium text-neutral-500 mb-2">Ask the fine print</h3>
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && q.trim() && ask(q)}
               placeholder="Ask a Local Law 97 question…"
               className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <button onClick={() => q.trim() && ask(q)} disabled={loading}
                className="rounded-lg bg-neutral-900 text-white text-sm px-3 py-2 active:scale-[0.97] transition-transform disabled:opacity-50">
          {loading ? "…" : "Ask"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {EXAMPLES.map(e => <button key={e} onClick={() => ask(e)} className="text-[11px] text-neutral-500 bg-neutral-100 rounded-full px-2 py-0.5 hover:bg-neutral-200 active:scale-[0.97] transition-transform">{e}</button>)}
      </div>
      {ans && (
        <div className="mt-3 rounded-lg bg-neutral-50 border border-neutral-200 p-3">
          <p className="text-sm">{ans.answer}</p>
          {ans.citations.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {ans.citations.map((c, i) => (
                <li key={i} className="text-xs text-neutral-600">
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{c.source}</a>
                  <span className="text-neutral-400"> — “{c.quote}”</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-neutral-400 mt-2">Not covered by the curated corpus — verify with an official DOB source.</p>}
          <p className="text-[11px] text-neutral-400 mt-2">Answers over a curated LL97 corpus; verify against the cited source.</p>
        </div>
      )}
    </section>
  );
}
```
- [ ] 10.5 Modify `app/page.tsx` — after the P0 result card renders `BuildingFacts` + `FineResult[]`, fetch `/api/optimize` and `/api/advise` in parallel and render the four components. Add (adapt to the existing P0 page structure; the key wiring is below):
```tsx
// inside the result view, once `facts` and `fines` are in state:
const [plan, setPlan] = useState<RetrofitPlan | null>(null);
const [advice, setAdvice] = useState<AdvicePlan | null>(null);
useEffect(() => {
  if (!facts || !fines) return;
  (async () => {
    const [optRes, advRes] = await Promise.all([
      fetch("/api/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, fines }) }),
      fetch("/api/advise", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, fines, planPeriod: "2030-2034" }) }),
    ]);
    setPlan(await optRes.json());
    setAdvice(await advRes.json());
  })();
}, [facts, fines]);
// …in JSX:
{advice && <p className="text-sm text-neutral-700">{advice.explainer}
  <span className="ml-2 text-[11px] uppercase tracking-wide text-neutral-400">{advice.source === "ai" ? "AI-ranked" : "estimated"}</span></p>}
{plan && <MaccChart macc={plan.macc} chosen={plan.chosenMeasureKeys} />}
{plan && <ScheduleTimeline schedule={plan.schedule} />}
{advice && <FinancingList fixes={advice.rankedFixes} />}
<AskPanel />
```
(Imports: `MaccChart`, `ScheduleTimeline`, `FinancingList`, `AskPanel`, and types `RetrofitPlan` from `@/lib/optimize/retrofit`, `AdvicePlan` from `@/lib/ai/advise`.)
- [ ] 10.6 `npm run build` — must pass.
- [ ] 10.7 `pkill -f "next start"` then `npm start &`; screenshot the result view via `/tmp/shots/shot.mjs http://localhost:3000 /tmp/shots/p1` and **read the PNGs** to confirm: the MACC chart renders with green chosen bars; the schedule shows pre-2030 years + the 2030 cliff row; financing pills don't overflow; the Ask panel returns an answer with visible citation links. Fix → rebuild → rescreenshot until clean.
- [ ] 10.8 Commit: `git add components app/page.tsx app/globals.css && git commit -m "feat(ui): MaccChart, ScheduleTimeline, FinancingList, AskPanel wired into the result view"` (with trailer).

---

## Task 11 — Full P1 verification

**Files** — none (verification only)

### Steps
- [ ] 11.1 `npx vitest run` — the entire suite is green (P0 + new P1 tests: macc, retrofit, roi, advise, rag/retrieve, ask, cache, api routes).
- [ ] 11.2 `npx tsc --noEmit` — no type errors; every implemented type matches the LOCKED INTERFACE CONTRACT field-for-field.
- [ ] 11.3 `npm run build` — passes.
- [ ] 11.4 End-to-end smoke (cache + no key): with `ANTHROPIC_API_KEY` unset, run a demo building through the page; confirm `/api/advise` returns `source:"fallback"` (badge "estimated") and `/api/ask` returns cited answers from the corpus — all without network. If `data/cache/llm/*.json` was populated by `scripts/precompute-llm.ts`, confirm cache hits return instantly.
- [ ] 11.5 Optional (key present): `vercel env add ANTHROPIC_API_KEY` locally or export it, run `npx tsx scripts/precompute-llm.ts`, confirm advise badges read "AI-ranked" and the cache files are written; re-run the page to confirm cached hits.
- [ ] 11.6 Commit any verification fixes; the P1 deliverable is complete.

---

## Self-check (every P1 spec item maps to a task)

| Spec item (index §P1 + design §6.3/6.4/6.7) | Task |
|---|---|
| Retrofit optimizer: exact 2^N enumeration, compound reductions, capex − best rebate, fines-to-2050, min-TCO meeting target | Task 2 (+ fixture/golden in Task 1) |
| MACC: per-measure $/tCO2e, sorted ascending | Task 1 (golden), Task 2 (`buildMacc`) |
| Schedule: chosen measures by MACC, placed before the 2030 cliff | Task 2 (`schedule`), Task 10 (`ScheduleTimeline`) |
| Uncertainty: re-run at Low/High → `range {tcoLowUSD, tcoHighUSD}` | Task 2 (`range`) |
| Golden test with hand-checked MACC + known-optimal subset (hand calc shown) | Task 1 (full derivation), Task 2 (assertions) |
| `lib/advise/roi.ts` remade: `FixCandidate[]`, rebate match, payback, tested | Task 3 |
| `lib/ai/advise.ts` remade: Claude (`claude-opus-4-8`, structured output) ORDERS code-computed fixes + prose; fallback `source:'fallback'` badge "estimated"; tested with mocked client | Task 4 |
| RAG corpus `lib/rag/corpus/*.md` with source-URL headers (incl. affordable-housing + good-faith-effort coverage) | Task 5 |
| `lib/rag/retrieve.ts` BM25 top-k, pure + tested | Task 6 |
| `lib/ai/ask.ts` `answerLawQuestion → RagAnswer` with `Citation[]`, cite + refuse, fallback returns top chunks; handles the two required questions | Task 7 |
| API routes `/api/advise`, `/api/optimize`, `/api/ask` (Response.json, contract shapes) | Task 9 |
| LLM response caching for the 3 demo buildings (`data/cache/llm/*.json`) | Task 8 (+ cache-first reads in Task 9) |
| UI: MaccChart (Recharts), ScheduleTimeline, AskPanel (visible citation links), FinancingList, wired into `app/page.tsx` | Task 10 |

**No placeholders:** every code step contains complete implementations — real optimizer math, real BM25, real Claude `messages.create` calls with `output_config.format`, real test assertions against hand-computed numbers (MACC $400/$500/$5,000; chosen `{heat-pump, controls, lighting}`; capex $2,620,000; TCO $3,177,440; fines-avoided $3,784,160; payback heat-pump = 2,500,000/134,000). No "TBD", no "add error handling later", no "similar to above".

**Types match the contract:** `MaccPoint`, `ScheduledMeasure`, `RetrofitPlan`, `OptimizeInput`, `optimizeRetrofit` (Task 2); `FixCandidate`, `AdvicePlan`, `generateAdvice` (Task 4); `Citation`, `RagAnswer`, `answerLawQuestion` (Task 7) — all implemented field-for-field as frozen in the LOCKED INTERFACE CONTRACT, importing `FineResult`/`Period` from `@/lib/ll97/engine`, `Measure`/`RebateProgram`/`MatchedRebate` from `@/data/catalogs/types`, and `BuildingFacts` from `@/lib/data/types` as the contract specifies.
