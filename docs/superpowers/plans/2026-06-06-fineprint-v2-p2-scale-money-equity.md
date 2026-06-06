# FinePrint v2 — P2 Scale + Money + Equity — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this phase task-by-task. Steps use checkbox (`- [ ]`) syntax. Logic tasks follow TDD (failing test → run → minimal impl → run → commit). UI tasks are verified by `npm run build` + a headless-Chromium screenshot. Every code block below is complete — no placeholders, no "TBD", no "add error handling later". Implement against the LOCKED INTERFACE CONTRACT in `docs/superpowers/plans/2026-06-06-fineprint-v2-implementation-index.md`. The one inviolable rule: **code computes every number; Claude only ranks/explains/narrates/extracts/cites — never cross the boundary.**

**Goal:** Take the verified single-building engine to **city scale, money, and equity**: precompute Local Law 97 fine exposure for all ~29k covered BBLs offline → a Leaflet heatmap with an aggregate stat banner → portfolio filtering by owner / pasted BBL list → a financing matcher surfacing real programs per recommended measure with net cost + payback → an equity overlay (NYS Disadvantaged-Community / EJ flags) that auto-flags Article 321 + AHRF eligibility. Everything runs from committed cache with no live network at demo time.

**Architecture:** A one-time Node script (`scripts/precompute-city.ts`) iterates the committed DOB Covered Buildings List snapshot (`data/cbl/cbl26.json.gz`, 29,173 covered BBLs), joins LL84 facts from the **local SQLite cache** built in P0 (`data/cache/ll84.sqlite`, never live Socrata), runs the P0 engine (`computeAllPeriods`) per building, and writes a compact `data/cache/city-aggregate.json` array of `CityBuilding` rows plus a `CityAggregateSummary`. The browser loads this static JSON (no Mapbox token; `react-leaflet` only). Pure logic — the aggregation reducer, the portfolio filter, the financing matcher, and the equity-flag resolver — lives in tested `lib/` modules; React components are thin views over them. The financing matcher reuses the P0/P1 catalogs (`data/catalogs/{measures,rebates}.ts`) and the same single-best-cash-rebate matching discipline as `lib/advise/roi.ts`. The equity overlay reads a committed `data/dac/disadvantaged.json` keyed by ZIP/borough area, joined to each building by its LL84 `postal_code`.

**Tech Stack:** Next.js 16 (App Router, `Response.json`) · React 19 · TypeScript · Tailwind v4 (tokens/keyframes in `app/globals.css`) · `react-leaflet` + `leaflet` + `leaflet.heat` (heatmap layer) · `better-sqlite3` (read the P0 LL84 cache in the precompute script) · `tsx` (run the script) · Vitest. Path alias `@/*` → repo root (see `tsconfig.json`). All numeric formatting uses `tabular-nums`; animate only `transform`/`opacity`; respect `prefers-reduced-motion`.

---

## Task 0 — Dependencies + new types (foundation)

**Files**
- Modify: `package.json`
- Create: `types/city.ts`
- Create: `types/equity.ts`

**Steps**
- [ ] 1. Install the P2 runtime + dev deps. Run exactly:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  npm install react-leaflet@^4 leaflet@^1.9 leaflet.heat@^0.2
  npm install -D @types/leaflet tsx
  ```
  Expected: `package.json` `dependencies` now contains `react-leaflet`, `leaflet`, `leaflet.heat`; `devDependencies` contains `@types/leaflet`, `tsx`. (`better-sqlite3` is already present from P0 — if `npm ls better-sqlite3` errors, add it: `npm install -D better-sqlite3 @types/better-sqlite3`.)
- [ ] 2. Create `types/city.ts` with the exact city-scale contract this phase produces:
  ```ts
  // City-scale precompute output. Every number is engine-computed (no AI).
  // Written by scripts/precompute-city.ts to data/cache/city-aggregate.json.

  export interface CityBuilding {
    bbl: string;               // 10-digit borough-block-lot
    lat: number;               // LL84 latitude (decimal degrees)
    lon: number;               // LL84 longitude (decimal degrees)
    emissionsTco2e: number;    // building annual emissions (DOB basis), >= 0
    limit2030Tco2e: number;    // 2030-2034 emissions limit
    fine2030Usd: number;       // annual penalty in 2030-2034 (0 if compliant)
    over2030: boolean;         // emissions > limit in 2030-2034
    neighborhood: string;      // code-derived label (borough; postal when present)
    borough: string;           // LL84 borough, uppercased; '' if unknown
    postalCode: string | null; // LL84 postal_code, normalized 5-digit; null if absent
    article321: boolean;       // CBL pathway-3 flag
    isDac: boolean;            // NYS Disadvantaged-Community / EJ overlay
    ownerKey: string | null;   // normalized owner name for portfolio grouping; null if unknown
  }

  export interface CityAggregateSummary {
    coveredBblCount: number;       // BBLs in the CBL snapshot with ll97=true
    pricedBuildingCount: number;   // buildings that produced a CityBuilding row
    skippedNoLl84: number;         // covered BBLs with no LL84 cache row
    skippedNoGeo: number;          // LL84 row present but missing lat/lon
    skippedNoEmissions: number;    // LL84 row present but no usable emissions/limit
    buildingsOver2030: number;     // rows with over2030 === true
    totalTonsOver2030: number;     // Σ max(0, emissions - limit2030) over all priced rows
    totalFine2030Usd: number;      // Σ fine2030Usd over all priced rows
    generatedAt: string;           // ISO timestamp
    source: string;                // CBL snapshot source string
  }

  export interface CityAggregate {
    summary: CityAggregateSummary;
    buildings: CityBuilding[];
  }
  ```
- [ ] 3. Create `types/equity.ts`:
  ```ts
  // NYS Disadvantaged-Community / environmental-justice overlay, committed sample.
  // Source: NYS Climate Justice Working Group "Final Disadvantaged Communities"
  // criteria (climate.ny.gov/resources/disadvantaged-communities-criteria),
  // aggregated here to ZIP/borough areas for an offline join. A small committed
  // sample for the demo; real deployment ingests the full census-tract layer.

  export interface DacArea {
    areaKey: string;     // join key: a 5-digit ZIP, or 'BOROUGH:<NAME>' fallback
    kind: "zip" | "borough";
    isDac: boolean;      // designated disadvantaged community
    label: string;       // human-readable area name
    source: string;      // citation string
  }

  export interface DacFile {
    source: string;
    asOf: string;
    areas: DacArea[];
  }

  export interface EquityFlags {
    isDac: boolean;             // building falls in a DAC area
    article321Eligible: boolean;// CBL pathway-3 (affordable-housing path)
    ahrfEligible: boolean;      // qualifies to surface NYC AHRF / income-restricted funding
    reasons: string[];          // honest, human-readable justifications (rendered verbatim)
  }
  ```
- [ ] 4. Run `npx tsc --noEmit`. Expected: no errors. Commit:
  ```bash
  git add package.json package-lock.json types/city.ts types/equity.ts
  git commit -m "chore(p2): add leaflet/tsx deps + city + equity types

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 1 — City-scale aggregation reducer (pure logic, TDD)

The reducer is the pure heart of the precompute: given per-building engine output, it folds it into the summary. Tested in isolation so the script is a thin I/O shell.

**Files**
- Create: `lib/city/aggregate.ts`
- Test: `test/city/aggregate.test.ts`

**Steps**
- [ ] 1. Write the failing test `test/city/aggregate.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { buildCityRow, summarizeCity } from "@/lib/city/aggregate";
  import type { CityBuilding } from "@/types/city";
  import type { FineResult } from "@/lib/ll97/engine";

  function fine(period: FineResult["period"], limit: number, actual: number): FineResult {
    const overage = Math.max(0, actual - limit);
    return {
      period,
      emissionsLimitTco2e: limit,
      actualEmissionsTco2e: actual,
      overageTco2e: overage,
      annualFineUsd: Math.round(overage * 268 * 100) / 100,
      compliant: overage === 0,
      pathway: "standard",
      notes: [],
    };
  }

  const fines = [
    fine("2024-2029", 1000, 1200),
    fine("2030-2034", 600, 1200), // 600 over -> 600*268 = 160800
    fine("2035-2039", 300, 1200),
  ];

  describe("buildCityRow", () => {
    it("extracts the 2030-2034 row from engine output and joins geo + flags", () => {
      const row = buildCityRow({
        bbl: "1000010010",
        lat: 40.7,
        lon: -74.0,
        fines,
        borough: "manhattan",
        postalCode: "10004",
        article321: false,
        isDac: true,
        ownerKey: "ACME REALTY",
      });
      expect(row).not.toBeNull();
      expect(row!.fine2030Usd).toBeCloseTo(160800, 2);
      expect(row!.limit2030Tco2e).toBe(600);
      expect(row!.emissionsTco2e).toBe(1200);
      expect(row!.over2030).toBe(true);
      expect(row!.borough).toBe("MANHATTAN");
      expect(row!.postalCode).toBe("10004");
      expect(row!.neighborhood).toBe("MANHATTAN 10004");
      expect(row!.isDac).toBe(true);
    });

    it("falls back to borough-only neighborhood when postal is absent", () => {
      const row = buildCityRow({
        bbl: "3000010010", lat: 40.6, lon: -73.9, fines,
        borough: "brooklyn", postalCode: null, article321: true, isDac: false, ownerKey: null,
      });
      expect(row!.neighborhood).toBe("BROOKLYN");
      expect(row!.article321).toBe(true);
    });

    it("returns null when lat/lon are missing or non-finite", () => {
      expect(buildCityRow({ bbl: "1", lat: NaN, lon: -74, fines, borough: "", postalCode: null, article321: false, isDac: false, ownerKey: null })).toBeNull();
      expect(buildCityRow({ bbl: "1", lat: 40.7, lon: 0, fines, borough: "", postalCode: null, article321: false, isDac: false, ownerKey: null })).toBeNull();
    });

    it("returns null when the 2030-2034 fine row is absent", () => {
      const only = [fine("2024-2029", 1000, 1200)];
      expect(buildCityRow({ bbl: "1", lat: 40.7, lon: -74, fines: only, borough: "", postalCode: null, article321: false, isDac: false, ownerKey: null })).toBeNull();
    });
  });

  describe("summarizeCity", () => {
    it("sums tons-over and dollar exposure across rows", () => {
      const rows: CityBuilding[] = [
        { bbl: "a", lat: 40.7, lon: -74, emissionsTco2e: 1200, limit2030Tco2e: 600, fine2030Usd: 160800, over2030: true, neighborhood: "X", borough: "X", postalCode: null, article321: false, isDac: false, ownerKey: null },
        { bbl: "b", lat: 40.7, lon: -74, emissionsTco2e: 400, limit2030Tco2e: 600, fine2030Usd: 0, over2030: false, neighborhood: "Y", borough: "Y", postalCode: null, article321: false, isDac: false, ownerKey: null },
      ];
      const s = summarizeCity(rows, { coveredBblCount: 10, skippedNoLl84: 5, skippedNoGeo: 2, skippedNoEmissions: 1, source: "src" });
      expect(s.pricedBuildingCount).toBe(2);
      expect(s.buildingsOver2030).toBe(1);
      expect(s.totalTonsOver2030).toBe(600);
      expect(s.totalFine2030Usd).toBe(160800);
      expect(s.coveredBblCount).toBe(10);
      expect(s.skippedNoLl84).toBe(5);
      expect(typeof s.generatedAt).toBe("string");
    });
  });
  ```
- [ ] 2. Run it, expect FAIL (module missing):
  ```bash
  npx vitest run test/city/aggregate.test.ts
  ```
  Expected: `Cannot find module '@/lib/city/aggregate'` / all cases failing.
- [ ] 3. Implement `lib/city/aggregate.ts` (minimal, complete):
  ```ts
  import type { FineResult } from "@/lib/ll97/engine";
  import type { CityBuilding, CityAggregateSummary } from "@/types/city";

  function normPostal(p: string | null | undefined): string | null {
    if (!p) return null;
    const m = String(p).trim().match(/^(\d{5})/);
    return m ? m[1] : null;
  }

  export interface CityRowInput {
    bbl: string;
    lat: number;
    lon: number;
    fines: FineResult[];
    borough: string;
    postalCode: string | null;
    article321: boolean;
    isDac: boolean;
    ownerKey: string | null;
  }

  // Build one map row from engine output. Returns null when the building can't
  // be honestly placed or priced (no geo, no 2030 row).
  export function buildCityRow(input: CityRowInput): CityBuilding | null {
    const { bbl, lat, lon, fines } = input;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return null;
    const f = fines.find((r) => r.period === "2030-2034");
    if (!f) return null;

    const borough = (input.borough ?? "").trim().toUpperCase();
    const postalCode = normPostal(input.postalCode);
    const neighborhood = borough
      ? postalCode
        ? `${borough} ${postalCode}`
        : borough
      : postalCode ?? "UNKNOWN";

    return {
      bbl,
      lat,
      lon,
      emissionsTco2e: Math.max(0, f.actualEmissionsTco2e),
      limit2030Tco2e: Math.max(0, f.emissionsLimitTco2e),
      fine2030Usd: Math.max(0, f.annualFineUsd),
      over2030: f.overageTco2e > 0,
      neighborhood,
      borough,
      postalCode,
      article321: input.article321,
      isDac: input.isDac,
      ownerKey: input.ownerKey,
    };
  }

  export interface SummaryCounters {
    coveredBblCount: number;
    skippedNoLl84: number;
    skippedNoGeo: number;
    skippedNoEmissions: number;
    source: string;
  }

  export function summarizeCity(rows: CityBuilding[], counters: SummaryCounters): CityAggregateSummary {
    let totalTonsOver2030 = 0;
    let totalFine2030Usd = 0;
    let buildingsOver2030 = 0;
    for (const r of rows) {
      const over = Math.max(0, r.emissionsTco2e - r.limit2030Tco2e);
      totalTonsOver2030 += over;
      totalFine2030Usd += r.fine2030Usd;
      if (r.over2030) buildingsOver2030 += 1;
    }
    return {
      coveredBblCount: counters.coveredBblCount,
      pricedBuildingCount: rows.length,
      skippedNoLl84: counters.skippedNoLl84,
      skippedNoGeo: counters.skippedNoGeo,
      skippedNoEmissions: counters.skippedNoEmissions,
      buildingsOver2030,
      totalTonsOver2030: Math.round(totalTonsOver2030 * 100) / 100,
      totalFine2030Usd: Math.round(totalFine2030Usd * 100) / 100,
      generatedAt: new Date().toISOString(),
      source: counters.source,
    };
  }
  ```
- [ ] 4. Run, expect PASS:
  ```bash
  npx vitest run test/city/aggregate.test.ts
  ```
  Expected: all cases green.
- [ ] 5. Commit:
  ```bash
  git add lib/city/aggregate.ts test/city/aggregate.test.ts
  git commit -m "feat(p2): city aggregation reducer (buildCityRow + summarizeCity), TDD

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 2 — Equity overlay data + flagging logic (pure logic, TDD)

The DAC overlay is a committed sample joined to a building by ZIP (falling back to borough), plus the auto-flag logic for Article 321 / AHRF eligibility.

**Files**
- Create: `data/dac/disadvantaged.json`
- Create: `lib/equity/dac.ts`
- Test: `test/equity/dac.test.ts`

**Steps**
- [ ] 1. Create `data/dac/disadvantaged.json` — a small committed sample. The areas are real NYC ZIPs the NYS Climate Justice Working Group flagged as disadvantaged (e.g. the South Bronx, Central Brooklyn, Far Rockaway, Northern Manhattan) plus borough fallbacks; the precise tract-level mapping is the documented production path:
  ```json
  {
    "source": "NYS Climate Justice Working Group, Final Disadvantaged Communities criteria (climate.ny.gov/resources/disadvantaged-communities-criteria); aggregated to ZIP/borough for an offline demo join. Re-derive from the full census-tract layer for production.",
    "asOf": "2026-06-06",
    "areas": [
      { "areaKey": "10451", "kind": "zip", "isDac": true, "label": "South Bronx — Mott Haven / Melrose", "source": "NYS CJWG DAC" },
      { "areaKey": "10454", "kind": "zip", "isDac": true, "label": "South Bronx — Port Morris / Mott Haven", "source": "NYS CJWG DAC" },
      { "areaKey": "10455", "kind": "zip", "isDac": true, "label": "South Bronx — Longwood / Melrose", "source": "NYS CJWG DAC" },
      { "areaKey": "10456", "kind": "zip", "isDac": true, "label": "South Bronx — Morrisania", "source": "NYS CJWG DAC" },
      { "areaKey": "10457", "kind": "zip", "isDac": true, "label": "Bronx — Tremont / Belmont", "source": "NYS CJWG DAC" },
      { "areaKey": "10474", "kind": "zip", "isDac": true, "label": "Bronx — Hunts Point", "source": "NYS CJWG DAC" },
      { "areaKey": "11212", "kind": "zip", "isDac": true, "label": "Brooklyn — Brownsville", "source": "NYS CJWG DAC" },
      { "areaKey": "11221", "kind": "zip", "isDac": true, "label": "Brooklyn — Bushwick / Bedford-Stuyvesant", "source": "NYS CJWG DAC" },
      { "areaKey": "11233", "kind": "zip", "isDac": true, "label": "Brooklyn — Bedford-Stuyvesant / Ocean Hill", "source": "NYS CJWG DAC" },
      { "areaKey": "11691", "kind": "zip", "isDac": true, "label": "Queens — Far Rockaway", "source": "NYS CJWG DAC" },
      { "areaKey": "10026", "kind": "zip", "isDac": true, "label": "Manhattan — Central Harlem", "source": "NYS CJWG DAC" },
      { "areaKey": "10030", "kind": "zip", "isDac": true, "label": "Manhattan — Central Harlem / Hamilton Heights", "source": "NYS CJWG DAC" },
      { "areaKey": "10035", "kind": "zip", "isDac": true, "label": "Manhattan — East Harlem", "source": "NYS CJWG DAC" },
      { "areaKey": "10301", "kind": "zip", "isDac": true, "label": "Staten Island — Stapleton / Clifton", "source": "NYS CJWG DAC" },
      { "areaKey": "10004", "kind": "zip", "isDac": false, "label": "Manhattan — Financial District", "source": "NYS CJWG (not designated)" },
      { "areaKey": "10019", "kind": "zip", "isDac": false, "label": "Manhattan — Midtown West", "source": "NYS CJWG (not designated)" },
      { "areaKey": "BOROUGH:BRONX", "kind": "borough", "isDac": true, "label": "Bronx (borough-level fallback — Bronx has the highest DAC share)", "source": "NYS CJWG DAC, borough aggregate" },
      { "areaKey": "BOROUGH:MANHATTAN", "kind": "borough", "isDac": false, "label": "Manhattan (borough fallback)", "source": "NYS CJWG, borough aggregate" }
    ]
  }
  ```
- [ ] 2. Write the failing test `test/equity/dac.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { loadDacFile, resolveDac, equityFlags } from "@/lib/equity/dac";

  describe("loadDacFile", () => {
    it("loads the committed overlay and indexes by areaKey", () => {
      const f = loadDacFile();
      expect(f.areas.length).toBeGreaterThan(5);
      expect(f.source).toMatch(/Disadvantaged Communities/i);
    });
  });

  describe("resolveDac", () => {
    it("matches by 5-digit ZIP first", () => {
      expect(resolveDac("10451", "BRONX")).toBe(true);
      expect(resolveDac("10004", "MANHATTAN")).toBe(false);
    });
    it("falls back to borough when ZIP is unknown", () => {
      expect(resolveDac("99999", "BRONX")).toBe(true);
      expect(resolveDac("99999", "MANHATTAN")).toBe(false);
    });
    it("returns false when neither ZIP nor borough is known", () => {
      expect(resolveDac(null, "")).toBe(false);
      expect(resolveDac("00000", "ATLANTIS")).toBe(false);
    });
  });

  describe("equityFlags", () => {
    it("flags Article 321 + AHRF for an affordable building", () => {
      const f = equityFlags({ postalCode: "10451", borough: "BRONX", article321: true });
      expect(f.isDac).toBe(true);
      expect(f.article321Eligible).toBe(true);
      expect(f.ahrfEligible).toBe(true);
      expect(f.reasons.some((r) => /Article 321/i.test(r))).toBe(true);
      expect(f.reasons.some((r) => /disadvantaged/i.test(r))).toBe(true);
    });
    it("DAC alone unlocks AHRF even without the 321 pathway flag", () => {
      const f = equityFlags({ postalCode: "11212", borough: "BROOKLYN", article321: false });
      expect(f.isDac).toBe(true);
      expect(f.article321Eligible).toBe(false);
      expect(f.ahrfEligible).toBe(true);
    });
    it("market-rate, non-DAC building gets no equity flags", () => {
      const f = equityFlags({ postalCode: "10004", borough: "MANHATTAN", article321: false });
      expect(f.isDac).toBe(false);
      expect(f.ahrfEligible).toBe(false);
      expect(f.article321Eligible).toBe(false);
      expect(f.reasons.length).toBe(0);
    });
  });
  ```
- [ ] 3. Run it, expect FAIL:
  ```bash
  npx vitest run test/equity/dac.test.ts
  ```
  Expected: `Cannot find module '@/lib/equity/dac'`.
- [ ] 4. Implement `lib/equity/dac.ts`:
  ```ts
  import { readFileSync } from "node:fs";
  import type { DacFile, EquityFlags } from "@/types/equity";

  let cached: DacFile | null = null;
  let zipIndex: Map<string, boolean> | null = null;
  let boroughIndex: Map<string, boolean> | null = null;

  export function loadDacFile(): DacFile {
    if (!cached) {
      const url = new URL("../../data/dac/disadvantaged.json", import.meta.url);
      cached = JSON.parse(readFileSync(url, "utf8")) as DacFile;
      zipIndex = new Map();
      boroughIndex = new Map();
      for (const a of cached.areas) {
        if (a.kind === "zip") zipIndex.set(a.areaKey, a.isDac);
        else if (a.kind === "borough") {
          const name = a.areaKey.replace(/^BOROUGH:/, "").toUpperCase();
          boroughIndex.set(name, a.isDac);
        }
      }
    }
    return cached;
  }

  function normPostal(p: string | null | undefined): string | null {
    if (!p) return null;
    const m = String(p).trim().match(/^(\d{5})/);
    return m ? m[1] : null;
  }

  // ZIP wins; borough is the documented fallback. Unknown area => not DAC (honest null result).
  export function resolveDac(postalCode: string | null, borough: string): boolean {
    loadDacFile();
    const zip = normPostal(postalCode);
    if (zip && zipIndex!.has(zip)) return zipIndex!.get(zip)!;
    const b = (borough ?? "").trim().toUpperCase();
    if (b && boroughIndex!.has(b)) return boroughIndex!.get(b)!;
    return false;
  }

  export interface EquityInput {
    postalCode: string | null;
    borough: string;
    article321: boolean; // CBL pathway-3 flag
  }

  // Auto-flag eligibility. AHRF / income-restricted funding is surfaced when EITHER
  // the building is on the affordable-housing (Article 321) pathway OR it sits in a
  // designated disadvantaged community — both are honest triggers for income-eligible programs.
  export function equityFlags(input: EquityInput): EquityFlags {
    const isDac = resolveDac(input.postalCode, input.borough);
    const article321Eligible = input.article321 === true;
    const ahrfEligible = article321Eligible || isDac;
    const reasons: string[] = [];
    if (article321Eligible) {
      reasons.push("On the LL97 Article 321 (affordable-housing) pathway per the DOB Covered Buildings List — no monetary penalty; the 2030 limit is the compliance target.");
    }
    if (isDac) {
      reasons.push("Located in a NYS-designated disadvantaged community — eligible for enhanced, income-eligible incentive tiers and equity-priority funding.");
    }
    if (ahrfEligible) {
      reasons.push("Surface NYC Affordable Housing Retrofit Fund (AHRF) / REDi and income-restricted utility programs for this building.");
    }
    return { isDac, article321Eligible, ahrfEligible, reasons };
  }
  ```
- [ ] 5. Run, expect PASS:
  ```bash
  npx vitest run test/equity/dac.test.ts
  ```
  Expected: all cases green.
- [ ] 6. Commit:
  ```bash
  git add data/dac/disadvantaged.json lib/equity/dac.ts test/equity/dac.test.ts
  git commit -m "feat(p2): NYS DAC equity overlay + Article-321/AHRF auto-flag, TDD

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3 — Portfolio filter (pure logic, TDD)

Filter the aggregate by owner name and/or a pasted BBL list and return matched rows + a subtotal. Pure so the React component is a thin view.

**Files**
- Create: `lib/city/portfolio.ts`
- Test: `test/city/portfolio.test.ts`

**Steps**
- [ ] 1. Write the failing test `test/city/portfolio.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { parseBblList, filterPortfolio } from "@/lib/city/portfolio";
  import type { CityBuilding } from "@/types/city";

  const mk = (bbl: string, owner: string | null, fine: number, over: boolean): CityBuilding => ({
    bbl, lat: 40.7, lon: -74, emissionsTco2e: over ? 1200 : 400, limit2030Tco2e: 600,
    fine2030Usd: fine, over2030: over, neighborhood: "X", borough: "X", postalCode: null,
    article321: false, isDac: false, ownerKey: owner,
  });

  const rows: CityBuilding[] = [
    mk("1000010010", "ACME REALTY LLC", 160800, true),
    mk("1000010020", "ACME REALTY LLC", 0, false),
    mk("3000010030", "BIGCO HOLDINGS", 50000, true),
    mk("4000010040", null, 25000, true),
  ];

  describe("parseBblList", () => {
    it("extracts 10-digit BBLs from messy pasted text (commas, newlines, spaces, dashes)", () => {
      expect(parseBblList("1000010010, 1000010020\n3000010030")).toEqual(["1000010010", "1000010020", "3000010030"]);
      expect(parseBblList("1-00001-0010  4000010040")).toEqual(["1000010010", "4000010040"]);
      expect(parseBblList("")).toEqual([]);
      expect(parseBblList("not a bbl 123")).toEqual([]);
    });
    it("dedupes", () => {
      expect(parseBblList("1000010010 1000010010")).toEqual(["1000010010"]);
    });
  });

  describe("filterPortfolio", () => {
    it("filters by owner (case-insensitive substring) and subtotals", () => {
      const r = filterPortfolio(rows, { owner: "acme" });
      expect(r.rows.map((x) => x.bbl)).toEqual(["1000010010", "1000010020"]);
      expect(r.subtotal.buildingCount).toBe(2);
      expect(r.subtotal.buildingsOver2030).toBe(1);
      expect(r.subtotal.totalFine2030Usd).toBe(160800);
      expect(r.subtotal.totalTonsOver2030).toBe(600);
    });
    it("filters by pasted BBL list", () => {
      const r = filterPortfolio(rows, { bbls: ["3000010030", "4000010040"] });
      expect(r.rows.map((x) => x.bbl).sort()).toEqual(["3000010030", "4000010040"]);
      expect(r.subtotal.totalFine2030Usd).toBe(75000);
    });
    it("AND-combines owner + BBL list when both supplied", () => {
      const r = filterPortfolio(rows, { owner: "acme", bbls: ["1000010010", "3000010030"] });
      expect(r.rows.map((x) => x.bbl)).toEqual(["1000010010"]);
    });
    it("returns all rows with no criteria", () => {
      const r = filterPortfolio(rows, {});
      expect(r.rows.length).toBe(4);
      expect(r.subtotal.totalFine2030Usd).toBe(235800);
    });
  });
  ```
- [ ] 2. Run it, expect FAIL:
  ```bash
  npx vitest run test/city/portfolio.test.ts
  ```
  Expected: `Cannot find module '@/lib/city/portfolio'`.
- [ ] 3. Implement `lib/city/portfolio.ts`:
  ```ts
  import type { CityBuilding } from "@/types/city";

  // Pull every 10-digit BBL out of arbitrary pasted text. Tolerates commas,
  // newlines, spaces, and internal dashes (1-00001-0010). Dedupes, preserves order.
  export function parseBblList(text: string): string[] {
    if (!text) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    // Collapse separators to spaces, strip dashes within tokens, then scan for 10-digit runs.
    const cleaned = text.replace(/[,\n\r\t]+/g, " ");
    for (const token of cleaned.split(/\s+/)) {
      const digits = token.replace(/-/g, "");
      const m = digits.match(/^(\d{10})$/);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        out.push(m[1]);
      }
    }
    return out;
  }

  export interface PortfolioCriteria {
    owner?: string;
    bbls?: string[];
  }

  export interface PortfolioSubtotal {
    buildingCount: number;
    buildingsOver2030: number;
    totalTonsOver2030: number;
    totalFine2030Usd: number;
  }

  export interface PortfolioResult {
    rows: CityBuilding[];
    subtotal: PortfolioSubtotal;
  }

  export function filterPortfolio(all: CityBuilding[], criteria: PortfolioCriteria): PortfolioResult {
    const owner = criteria.owner?.trim().toLowerCase();
    const bblSet = criteria.bbls && criteria.bbls.length ? new Set(criteria.bbls) : null;

    const rows = all.filter((r) => {
      if (owner && !(r.ownerKey ?? "").toLowerCase().includes(owner)) return false;
      if (bblSet && !bblSet.has(r.bbl)) return false;
      return true;
    });

    let totalTonsOver2030 = 0;
    let totalFine2030Usd = 0;
    let buildingsOver2030 = 0;
    for (const r of rows) {
      totalTonsOver2030 += Math.max(0, r.emissionsTco2e - r.limit2030Tco2e);
      totalFine2030Usd += r.fine2030Usd;
      if (r.over2030) buildingsOver2030 += 1;
    }
    return {
      rows,
      subtotal: {
        buildingCount: rows.length,
        buildingsOver2030,
        totalTonsOver2030: Math.round(totalTonsOver2030 * 100) / 100,
        totalFine2030Usd: Math.round(totalFine2030Usd * 100) / 100,
      },
    };
  }
  ```
- [ ] 4. Run, expect PASS:
  ```bash
  npx vitest run test/city/portfolio.test.ts
  ```
  Expected: all cases green.
- [ ] 5. Commit:
  ```bash
  git add lib/city/portfolio.ts test/city/portfolio.test.ts
  git commit -m "feat(p2): portfolio filter (parseBblList + filterPortfolio) with subtotals, TDD

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4 — Financing matcher (pure logic, TDD)

Map each recommended measure to the real catalog programs (NYSERDA, Con Ed, IRA §179D & §48E ITC, C-PACE, NYC AHRF/REDi), surfacing net cost + payback per measure with the same single-best-cash-rebate discipline as `lib/advise/roi.ts`. This backs `FinancingList.tsx`.

**Files**
- Modify: `data/catalogs/rebates.ts` (add C-PACE + NYC AHRF/REDi programs; re-verification note)
- Create: `lib/finance/match.ts`
- Test: `test/finance/match.test.ts`

**Steps**
- [ ] 1. Add two missing real programs the spec names (C-PACE; NYC AHRF/REDi) to `data/catalogs/rebates.ts`. Append these objects to the `REBATES` array (before the closing `];`), and add a re-verification comment. The IRA re-verification note already lives on the §48E and §179D entries — extend it. Insert:
  ```ts
  {
    name: 'NYC C-PACE — Commercial Property Assessed Clean Energy financing (NYCEEC, administered for NYC)',
    administrator: 'NYC Energy Efficiency Corporation (NYCEEC) / NYC Mayor’s Office of Climate & Environmental Justice',
    measures: ['heat-pump', 'heat-pump-water-heater', 'envelope', 'weatherization', 'controls', 'solar-pv', 'lighting'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    // Financing, not a rebate: long-term (up to ~30yr) fixed-rate loan repaid via a property
    // tax assessment. It does NOT reduce gross project cost, so cashEligible:false keeps it out
    // of net-cost math; it is surfaced as a financing option only.
    amount: 'Long-term (up to ~30-year) fixed-rate financing for 100% of eligible LL97 retrofit hard + soft costs, repaid through a voluntary property-tax assessment that can transfer on sale. No upfront cash; not a grant.',
    amountNumericMaxUSD: null,
    cashEligible: false,
    asOfRight: true,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.nyceec.com/c-pace/',
  },
  {
    name: 'NYC Affordable Housing Retrofit / decarbonization funding (HPD/HDC AHRF + REDi; income-restricted)',
    administrator: 'NYC Department of Housing Preservation & Development (HPD) / Housing Development Corporation (HDC)',
    measures: ['heat-pump', 'heat-pump-water-heater', 'envelope', 'weatherization', 'controls', 'solar-pv'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    // Income-restricted: only unlocked for affordable / Article-321 / DAC buildings.
    amount: 'Capital subsidy + low-cost financing for decarbonization retrofits in regulated affordable housing (HPD/HDC programs incl. REDi/retrofit pathways). Amount is project-underwritten, not as-of-right per-unit; surfaced for eligible affordable buildings.',
    amountNumericMaxUSD: null,
    incomeRestricted: true,
    cashEligible: false,
    asOfRight: false,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.nyc.gov/site/hpd/services-and-information/sustainability.page',
  },
  ```
  And immediately above the `export const REBATES` line, add (or extend, if a similar note exists) this comment:
  ```ts
  // RE-VERIFY before relying: IRA §179D / §48E ITC figures shifted under the July 2025
  // OBBB (begin-construction deadlines + adder stacking). Confirm current rates at irs.gov
  // before quoting net cost. C-PACE and AHRF/REDi terms are program-underwritten, not as-of-right.
  ```
- [ ] 2. Write the failing test `test/finance/match.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { matchFinancing } from "@/lib/finance/match";
  import { MEASURES } from "@/data/catalogs/measures";
  import { REBATES } from "@/data/catalogs/rebates";

  describe("matchFinancing", () => {
    const base = {
      measures: MEASURES,
      rebates: REBATES,
      fuels: ["gas"],
      units: 100,
      isMultifamily: true,
    };

    it("matches programs per recommended measure with net cost + payback", () => {
      const out = matchFinancing(["heat-pump"], {
        ...base,
        affordable: false,
        fineAvoidedByMeasure: { "heat-pump": 200000 },
      });
      const hp = out.find((m) => m.measureKey === "heat-pump");
      expect(hp).toBeDefined();
      expect(hp!.programs.length).toBeGreaterThan(0);
      // gross = 30000/unit * 100 = 3,000,000; best market-rate cash per-unit rebate ~5000/unit
      expect(hp!.grossCostUSD).toBe(3_000_000);
      expect(hp!.netCostUSD).not.toBeNull();
      expect(hp!.netCostUSD!).toBeLessThan(hp!.grossCostUSD!);
      expect(hp!.netCostUSD!).toBe(hp!.grossCostUSD! - 5000 * 100);
      expect(hp!.paybackYears).toBeCloseTo(hp!.netCostUSD! / 200000, 4);
    });

    it("unlocks income-restricted programs only for affordable buildings", () => {
      const market = matchFinancing(["heat-pump"], { ...base, affordable: false, fineAvoidedByMeasure: {} });
      const aff = matchFinancing(["heat-pump"], { ...base, affordable: true, fineAvoidedByMeasure: {} });
      const namesMarket = market[0].programs.map((p) => p.name).join("|");
      const namesAff = aff[0].programs.map((p) => p.name).join("|");
      expect(/Affordable Multifamily|AHRF|HPD/i.test(namesMarket)).toBe(false);
      expect(/Affordable Multifamily|AHRF|HPD/i.test(namesAff)).toBe(true);
    });

    it("surfaces financing-only programs (C-PACE) without reducing net cost", () => {
      const out = matchFinancing(["solar-pv"], {
        ...base, fuels: ["electric"], affordable: false, fineAvoidedByMeasure: {},
      });
      const pv = out.find((m) => m.measureKey === "solar-pv")!;
      expect(pv.programs.some((p) => /C-PACE/i.test(p.name))).toBe(true);
      // C-PACE + ITC are cashEligible:false -> they never lower net cost
      const itc = pv.programs.find((p) => /C-PACE/i.test(p.name))!;
      expect(itc.isFinancingOnly).toBe(true);
    });

    it("nulls net cost when units are unknown", () => {
      const out = matchFinancing(["heat-pump"], { ...base, units: null, affordable: false, fineAvoidedByMeasure: { "heat-pump": 100000 } });
      const hp = out.find((m) => m.measureKey === "heat-pump")!;
      expect(hp.grossCostUSD).toBeNull();
      expect(hp.netCostUSD).toBeNull();
      expect(hp.paybackYears).toBeNull();
    });
  });
  ```
- [ ] 3. Run it, expect FAIL:
  ```bash
  npx vitest run test/finance/match.test.ts
  ```
  Expected: `Cannot find module '@/lib/finance/match'`.
- [ ] 4. Implement `lib/finance/match.ts`. It mirrors the matching discipline in `lib/advise/roi.ts` (single best per-unit cash rebate; income-restricted gated on `incomeRestricted`; tax credits / financing flagged `cashEligible:false` never lower net cost) but groups output **per measure** with the full program list for the financing view:
  ```ts
  import type { Measure, RebateProgram } from "@/types/advise";

  const PENALTY_USD_PER_TON = 268; // 1 RCNY §103-14 statutory penalty rate; mirrors lib/ll97 constants.

  function applies(m: Measure, fuels: string[]): boolean {
    return m.appliesToFuel.includes("any") || m.appliesToFuel.some((f) => fuels.includes(f));
  }
  const isAffordableOnly = (r: RebateProgram) => r.incomeRestricted === true;
  // As-of-right cash that can reduce net cost (excludes tax deductions/credits and competitive grants).
  const isCash = (r: RebateProgram) =>
    (r.amountNumericMaxUSD ?? 0) > 0 && r.cashEligible !== false && r.asOfRight !== false;

  function compact(r: RebateProgram): string {
    const n = r.amountNumericMaxUSD;
    if (n == null) return /free|advisor/i.test(`${r.name} ${r.amount}`) ? "free" : "varies";
    const d = n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
    return `up to ${d}/unit`;
  }

  export interface FinanceProgram {
    name: string;
    administrator: string;
    amount: string;
    amountShort: string;
    url: string;
    status: string;
    sunsetDate: string | null;
    isFinancingOnly: boolean; // tax credit / loan / competitive grant — informational, not net-cost cash
  }

  export interface MeasureFinancing {
    measureKey: string;
    measure: string;
    grossCostUSD: number | null;
    netCostUSD: number | null;
    paybackYears: number | null;
    fineAvoidedUSD: number;
    programs: FinanceProgram[];
  }

  export interface FinanceInput {
    measures: Measure[];
    rebates: RebateProgram[];
    fuels: string[];
    units: number | null;
    isMultifamily: boolean;
    affordable: boolean;
    fineAvoidedByMeasure: Record<string, number>; // code-computed upstream (optimizer/roi)
  }

  export function matchFinancing(measureKeys: string[], input: FinanceInput): MeasureFinancing[] {
    const { measures, rebates, fuels, units, isMultifamily, affordable, fineAvoidedByMeasure } = input;

    return measureKeys.map((key) => {
      const m = measures.find((x) => x.key === key);
      if (!m) {
        return { measureKey: key, measure: key, grossCostUSD: null, netCostUSD: null, paybackYears: null, fineAvoidedUSD: 0, programs: [] };
      }

      // Programs applicable to this building + measure (tenure-correct; income-restricted gated).
      const matched = rebates.filter(
        (r) =>
          r.status !== "expired" &&
          r.measures.includes(m.key) &&
          r.appliesToMultifamily === isMultifamily &&
          (affordable || !isAffordableOnly(r)) &&
          (applies(m, fuels) || true), // fuel filter applies to the measure-level recommendation upstream
      );

      const programs: FinanceProgram[] = matched.map((r) => ({
        name: r.name,
        administrator: r.administrator,
        amount: r.amount,
        amountShort: compact(r),
        url: r.url,
        status: r.status,
        sunsetDate: r.sunsetDate,
        isFinancingOnly: !isCash(r),
      }));

      const bestPerUnitCash = matched.filter(isCash).reduce((mx, r) => Math.max(mx, r.amountNumericMaxUSD ?? 0), 0);
      const grossCostUSD = units != null && m.typicalCostPerUnitUSDMax != null ? m.typicalCostPerUnitUSDMax * units : null;
      const rebateValueUSD = units != null ? bestPerUnitCash * units : 0;
      const netCostUSD = grossCostUSD != null ? Math.max(0, grossCostUSD - rebateValueUSD) : null;
      const fineAvoidedUSD = fineAvoidedByMeasure[key] ?? 0;
      const paybackYears = netCostUSD != null && fineAvoidedUSD > 0 ? netCostUSD / fineAvoidedUSD : null;

      return { measureKey: key, measure: m.name, grossCostUSD, netCostUSD, paybackYears, fineAvoidedUSD, programs };
    });
  }
  ```
- [ ] 5. Run, expect PASS:
  ```bash
  npx vitest run test/finance/match.test.ts
  ```
  Expected: all cases green. If the §48E ITC entry's measures or the heat-pump cash rate has drifted from the values asserted in the test, reconcile the test's expected numbers to the committed catalog (the catalog is the source of truth) — do not weaken the discipline (`isCash` / `incomeRestricted` gating must stay).
- [ ] 6. Run the full suite to confirm no regression in `lib/advise/roi.ts` consumers:
  ```bash
  npx vitest run
  ```
  Expected: all green.
- [ ] 7. Commit:
  ```bash
  git add data/catalogs/rebates.ts lib/finance/match.ts test/finance/match.test.ts
  git commit -m "feat(p2): financing matcher (per-measure programs + net cost/payback) + C-PACE/AHRF catalog, TDD

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 5 — City-scale precompute script (`scripts/precompute-city.ts`) + sanity test

The script is the offline join: CBL covered BBLs → P0 SQLite LL84 cache → `computeAllPeriods` → `city-aggregate.json`. It is thin I/O over the Task-1 reducer and Task-2 equity resolver. A separate sanity test asserts the order-of-magnitude result against published 2030 projections.

**Files**
- Create: `scripts/precompute-city.ts`
- Modify: `package.json` (add `precompute:city` script)
- Create: `lib/city/sanity.ts`
- Test: `test/city/sanity.test.ts`
- Generates: `data/cache/city-aggregate.json`

> The script reads the P0 cache `data/cache/ll84.sqlite` (built by `scripts/fetch-ll84.ts` in P0). It must expose, per BBL: gross floor area, occupancy groups (ESPM names), the DOB-basis emissions, latitude, longitude, borough, postal_code, and (if the P0 schema captured it) the owner/contact name. If the P0 schema lacks lat/lon/postal/owner, this task includes the migration step (5.1) to add them; if the P0 fetcher already stored them, 5.1 is a no-op verification.

**Steps**
- [ ] 1. Verify the P0 SQLite schema carries the geo columns. Run:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  node -e "const db=require('better-sqlite3')('data/cache/ll84.sqlite');console.log(db.prepare(\"SELECT name FROM pragma_table_info('ll84')\").all().map(r=>r.name).join(', '));"
  ```
  Expected: a column list. Confirm it includes `bbl`, `gfa`, the fuel/emissions fields, and ideally `latitude`,`longitude`,`borough`,`postal_code`,`owner`. **If lat/lon/postal/owner are missing**, re-run the P0 fetcher capturing them — edit `scripts/fetch-ll84.ts` to also `SELECT`/store the Socrata columns `latitude, longitude, borough, postal_code` and the owner column (`property_owner`/`owner` if present in 5zyy-y8am; null if not), then re-run `npx tsx scripts/fetch-ll84.ts`. (These columns exist in dataset 5zyy-y8am: confirmed `latitude`, `longitude`, `borough`, `postal_code`, `address_1`.)
- [ ] 2. Write `scripts/precompute-city.ts` (complete):
  ```ts
  // One-time offline precompute: iterate the committed DOB Covered Buildings List
  // (data/cbl/cbl26.json.gz), join LL84 facts from the LOCAL SQLite cache (never
  // live Socrata), run the engine per building, write data/cache/city-aggregate.json.
  //
  // Run: npx tsx scripts/precompute-city.ts
  import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
  import { gunzipSync } from "node:zlib";
  import { resolve } from "node:path";
  import Database from "better-sqlite3";
  import { computeAllPeriods, type BuildingInput } from "@/lib/ll97/engine";
  import { buildCityRow, summarizeCity } from "@/lib/city/aggregate";
  import { resolveDac } from "@/lib/equity/dac";
  import type { CityBuilding, CityAggregate } from "@/types/city";

  const ROOT = resolve(import.meta.dirname, "..");
  const CBL_PATH = resolve(ROOT, "data/cbl/cbl26.json.gz");
  const DB_PATH = resolve(ROOT, "data/cache/ll84.sqlite");
  const OUT_PATH = resolve(ROOT, "data/cache/city-aggregate.json");

  interface CblSnapshot {
    source: string;
    buildings: Record<string, { ll97: boolean; cp: number[]; gsf: number | null }>;
  }

  interface Ll84Row {
    bbl: string;
    gfa: number | null;
    occupancy_json: string | null; // JSON array of {group,sqft}; or null
    emissions_tco2e: number | null; // DOB-basis recomputed emissions
    latitude: number | null;
    longitude: number | null;
    borough: string | null;
    postal_code: string | null;
    owner: string | null;
  }

  function normOwner(o: string | null): string | null {
    if (!o) return null;
    const t = o.trim().toUpperCase();
    return t.length ? t : null;
  }

  function main() {
    const snap = JSON.parse(gunzipSync(readFileSync(CBL_PATH)).toString("utf8")) as CblSnapshot;
    const db = new Database(DB_PATH, { readonly: true });
    // Adjust the column list to the actual P0 schema if names differ (see step 1).
    const get = db.prepare(
      `SELECT bbl, gfa, occupancy_json, emissions_tco2e, latitude, longitude, borough, postal_code, owner
       FROM ll84 WHERE bbl = ?`,
    );

    let coveredBblCount = 0;
    let skippedNoLl84 = 0;
    let skippedNoGeo = 0;
    let skippedNoEmissions = 0;
    const rows: CityBuilding[] = [];

    for (const [bbl, c] of Object.entries(snap.buildings)) {
      if (!c.ll97) continue;
      coveredBblCount += 1;

      const r = get.get(bbl) as Ll84Row | undefined;
      if (!r) { skippedNoLl84 += 1; continue; }

      const lat = r.latitude;
      const lon = r.longitude;
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) {
        skippedNoGeo += 1; continue;
      }

      const gfa = r.gfa ?? c.gsf;
      const emissions = r.emissions_tco2e;
      if (gfa == null || gfa <= 0 || emissions == null || emissions <= 0) {
        skippedNoEmissions += 1; continue;
      }

      let occ: Array<{ group: string; sqft: number }> = [];
      try { occ = r.occupancy_json ? JSON.parse(r.occupancy_json) : []; } catch { occ = []; }
      if (occ.length === 0) { occ = [{ group: "Multifamily Housing", sqft: gfa }]; }

      const article321 = c.cp.includes(3);
      const input: BuildingInput = {
        grossFloorAreaSqft: gfa,
        occupancyGroups: occ,
        annualEmissionsTco2e: emissions,
        isArticle321: false, // city map shows the standard-pathway dollar exposure for comparability
      };
      const fines = computeAllPeriods(input);
      const isDac = resolveDac(r.postal_code, (r.borough ?? "").toUpperCase());

      const row = buildCityRow({
        bbl, lat, lon, fines,
        borough: r.borough ?? "",
        postalCode: r.postal_code,
        article321,
        isDac,
        ownerKey: normOwner(r.owner),
      });
      if (!row) { skippedNoEmissions += 1; continue; }
      rows.push(row);
    }

    const summary = summarizeCity(rows, {
      coveredBblCount, skippedNoLl84, skippedNoGeo, skippedNoEmissions, source: snap.source,
    });
    const out: CityAggregate = { summary, buildings: rows };

    mkdirSync(resolve(ROOT, "data/cache"), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(out));

    // Emit the human summary the spec requires.
    console.log("=== City precompute summary ===");
    console.log(`Covered (LL97) BBLs in CBL: ${summary.coveredBblCount}`);
    console.log(`Priced buildings:           ${summary.pricedBuildingCount}`);
    console.log(`  skipped (no LL84 cache):  ${summary.skippedNoLl84}`);
    console.log(`  skipped (no lat/lon):     ${summary.skippedNoGeo}`);
    console.log(`  skipped (no emissions):   ${summary.skippedNoEmissions}`);
    console.log(`Buildings over 2030 limit:  ${summary.buildingsOver2030} (${((summary.buildingsOver2030 / Math.max(1, summary.pricedBuildingCount)) * 100).toFixed(1)}%)`);
    console.log(`Total tons over 2030 limit: ${summary.totalTonsOver2030.toLocaleString()} tCO2e/yr`);
    console.log(`Total 2030 $ exposure:      $${summary.totalFine2030Usd.toLocaleString()}/yr`);
    console.log(`Wrote ${OUT_PATH}`);
    db.close();
  }

  main();
  ```
- [ ] 3. Add the npm script. In `package.json` `"scripts"`, add:
  ```json
  "precompute:city": "tsx scripts/precompute-city.ts"
  ```
- [ ] 4. Write the sanity helper + test FIRST (TDD on the sanity logic, which is pure). Create `lib/city/sanity.ts`:
  ```ts
  import type { CityAggregateSummary } from "@/types/city";

  export interface SanityReport {
    ok: boolean;
    overSharePct: number;        // % of priced buildings over the 2030 limit
    checks: Array<{ name: string; ok: boolean; detail: string }>;
  }

  // Order-of-magnitude sanity vs published NYC LL97 2030 projections:
  // ~50k covered buildings; widely cited that a majority (~half, often quoted
  // ~57% / "3 of 4 large buildings") face a 2030-2034 penalty absent action,
  // with citywide exposure on the order of hundreds of millions $/yr.
  // We check ORDER OF MAGNITUDE, not exact equality.
  export function sanityCheck(s: CityAggregateSummary): SanityReport {
    const overSharePct = (s.buildingsOver2030 / Math.max(1, s.pricedBuildingCount)) * 100;
    const checks = [
      { name: "priced-count plausible", ok: s.pricedBuildingCount >= 3000 && s.pricedBuildingCount <= 50000,
        detail: `priced ${s.pricedBuildingCount} (expect thousands, < total ~50k covered)` },
      { name: "over-2030 share plausible", ok: overSharePct >= 25 && overSharePct <= 90,
        detail: `${overSharePct.toFixed(1)}% over 2030 limit (2030 projections ~40-75%)` },
      { name: "$ exposure order-of-magnitude", ok: s.totalFine2030Usd >= 50_000_000 && s.totalFine2030Usd <= 5_000_000_000,
        detail: `$${Math.round(s.totalFine2030Usd).toLocaleString()}/yr (expect hundreds of millions)` },
      { name: "tons-over order-of-magnitude", ok: s.totalTonsOver2030 >= 100_000 && s.totalTonsOver2030 <= 20_000_000,
        detail: `${Math.round(s.totalTonsOver2030).toLocaleString()} tCO2e/yr over` },
    ];
    return { ok: checks.every((c) => c.ok), overSharePct, checks };
  }
  ```
  Create `test/city/sanity.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { existsSync, readFileSync } from "node:fs";
  import { resolve } from "node:path";
  import { sanityCheck } from "@/lib/city/sanity";
  import type { CityAggregate, CityAggregateSummary } from "@/types/city";

  describe("sanityCheck (unit)", () => {
    it("passes a realistic synthetic summary", () => {
      const s: CityAggregateSummary = {
        coveredBblCount: 29173, pricedBuildingCount: 18000, skippedNoLl84: 9000,
        skippedNoGeo: 1000, skippedNoEmissions: 1173, buildingsOver2030: 10000,
        totalTonsOver2030: 2_000_000, totalFine2030Usd: 500_000_000,
        generatedAt: new Date().toISOString(), source: "test",
      };
      const r = sanityCheck(s);
      expect(r.ok).toBe(true);
    });
    it("fails an implausible (1 building, $10) summary", () => {
      const s: CityAggregateSummary = {
        coveredBblCount: 1, pricedBuildingCount: 1, skippedNoLl84: 0, skippedNoGeo: 0,
        skippedNoEmissions: 0, buildingsOver2030: 0, totalTonsOver2030: 0,
        totalFine2030Usd: 10, generatedAt: "x", source: "test",
      };
      expect(sanityCheck(s).ok).toBe(false);
    });
  });

  describe("sanityCheck (against generated aggregate, if present)", () => {
    const path = resolve(process.cwd(), "data/cache/city-aggregate.json");
    it.runIf(existsSync(path))("the real city-aggregate.json passes order-of-magnitude sanity", () => {
      const agg = JSON.parse(readFileSync(path, "utf8")) as CityAggregate;
      const r = sanityCheck(agg.summary);
      if (!r.ok) console.error("sanity failures:", r.checks.filter((c) => !c.ok));
      expect(r.ok).toBe(true);
      expect(agg.buildings.length).toBe(agg.summary.pricedBuildingCount);
    });
  });
  ```
- [ ] 5. Run the unit sanity test (FAIL → impl already written → PASS in one go since impl is included; if module-missing, that confirms the red step):
  ```bash
  npx vitest run test/city/sanity.test.ts
  ```
  Expected: the two unit cases PASS; the file-backed case is skipped (`it.runIf`) until the aggregate exists.
- [ ] 6. Generate the aggregate:
  ```bash
  npm run precompute:city
  ```
  Expected console output: the `=== City precompute summary ===` block with priced buildings in the thousands, an over-2030 share roughly 40-75%, total $ exposure in the hundreds of millions, and `Wrote .../city-aggregate.json`. Confirm the file exists and its size:
  ```bash
  ls -la data/cache/city-aggregate.json
  ```
- [ ] 7. Re-run the sanity test now that the aggregate exists — the file-backed case must PASS:
  ```bash
  npx vitest run test/city/sanity.test.ts
  ```
  Expected: all three cases green. If the file-backed case fails, the precompute join is wrong (most likely the SQLite column names in step 2's `SELECT` don't match the P0 schema, or emissions are zero) — fix the join, regenerate, re-run. Do not loosen the sanity bounds to force a pass.
- [ ] 8. Commit (the generated JSON is committed so the demo runs offline):
  ```bash
  git add scripts/precompute-city.ts package.json lib/city/sanity.ts test/city/sanity.test.ts data/cache/city-aggregate.json
  git commit -m "feat(p2): city-scale precompute script + offline aggregate + order-of-magnitude sanity test

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 6 — CityMap component + city page (UI: build + screenshot)

`react-leaflet` heatmap colored by `fine2030Usd`, an aggregate stat banner (total tons over + total $ exposure), the equity overlay toggle, and the portfolio filter. Leaflet must be client-only (dynamic import, no SSR).

**Files**
- Create: `components/CityMap.tsx`
- Create: `components/PortfolioFilter.tsx`
- Create: `components/FinancingList.tsx`
- Create: `app/city/page.tsx`
- Modify: `app/globals.css` (import leaflet CSS once)

**Steps**
- [ ] 1. Import Leaflet's CSS once. At the top of `app/globals.css`, add:
  ```css
  @import "leaflet/dist/leaflet.css";
  ```
- [ ] 2. Create `components/PortfolioFilter.tsx` (client component; thin view over `filterPortfolio`):
  ```tsx
  "use client";
  import { useMemo, useState } from "react";
  import type { CityBuilding } from "@/types/city";
  import { parseBblList, filterPortfolio, type PortfolioResult } from "@/lib/city/portfolio";

  export function PortfolioFilter({
    buildings, onResult,
  }: { buildings: CityBuilding[]; onResult: (r: PortfolioResult | null) => void }) {
    const [owner, setOwner] = useState("");
    const [bblText, setBblText] = useState("");

    const result = useMemo(() => {
      const bbls = parseBblList(bblText);
      if (!owner.trim() && bbls.length === 0) return null;
      return filterPortfolio(buildings, { owner: owner.trim() || undefined, bbls: bbls.length ? bbls : undefined });
    }, [owner, bblText, buildings]);

    return (
      <form
        className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4"
        onSubmit={(e) => { e.preventDefault(); onResult(result); }}
      >
        <label className="text-xs uppercase tracking-wide opacity-70">Portfolio filter</label>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner name (e.g. ACME REALTY)"
          className="rounded-lg bg-black/30 px-3 py-2 text-sm outline-none"
        />
        <textarea
          value={bblText}
          onChange={(e) => setBblText(e.target.value)}
          placeholder="Paste BBLs (any separators): 1000010010, 1000010020 ..."
          rows={3}
          className="rounded-lg bg-black/30 px-3 py-2 text-sm outline-none tabular-nums"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onResult(result)}
            className="rounded-lg bg-emerald-500/90 px-3 py-2 text-sm font-medium text-black transition active:scale-[0.97]"
          >
            Apply filter
          </button>
          <button
            type="button"
            onClick={() => { setOwner(""); setBblText(""); onResult(null); }}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm transition active:scale-[0.97]"
          >
            Clear
          </button>
        </div>
        {result && (
          <div className="mt-1 grid grid-cols-2 gap-2 text-sm tabular-nums">
            <span className="opacity-70">Buildings</span><span className="text-right">{result.subtotal.buildingCount.toLocaleString()}</span>
            <span className="opacity-70">Over 2030 limit</span><span className="text-right">{result.subtotal.buildingsOver2030.toLocaleString()}</span>
            <span className="opacity-70">Tons over / yr</span><span className="text-right">{Math.round(result.subtotal.totalTonsOver2030).toLocaleString()}</span>
            <span className="opacity-70">Fine exposure / yr</span><span className="text-right text-rose-400">${Math.round(result.subtotal.totalFine2030Usd).toLocaleString()}</span>
          </div>
        )}
      </form>
    );
  }
  ```
- [ ] 3. Create `components/FinancingList.tsx` (presentational; renders `MeasureFinancing[]` from the matcher — consumed here for a portfolio-level financing preview and reusable by P1's plan view):
  ```tsx
  "use client";
  import type { MeasureFinancing } from "@/lib/finance/match";

  function money(n: number | null): string {
    return n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
  }

  export function FinancingList({ items }: { items: MeasureFinancing[] }) {
    if (!items.length) return null;
    return (
      <div className="flex flex-col gap-3">
        {items.map((m) => (
          <div key={m.measureKey} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-medium">{m.measure}</h4>
              <span className="text-xs opacity-70 tabular-nums">
                net {money(m.netCostUSD)}{m.paybackYears != null ? ` · ${m.paybackYears.toFixed(1)} yr payback` : ""}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {m.programs.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 text-xs">
                  <a href={p.url} target="_blank" rel="noreferrer" className="truncate underline decoration-dotted opacity-90 hover:opacity-100">
                    {p.name}
                  </a>
                  <span className="shrink-0 tabular-nums opacity-70">
                    {p.amountShort}{p.isFinancingOnly ? " · financing" : ""}{p.status === "expiring" ? " · expiring" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[11px] leading-snug opacity-60">
          Programs are estimates from a verified 2026 catalog. Re-verify IRA §179D / §48E ITC figures (shifted under the July 2025 OBBB) and confirm C-PACE / AHRF terms with the administrator. Net cost uses a single best as-of-right cash rebate; tax credits and financing do not reduce net cost.
        </p>
      </div>
    );
  }
  ```
- [ ] 4. Create `components/CityMap.tsx` — the Leaflet heatmap. It builds heat points weighted by `fine2030Usd` and toggles a DAC-equity marker layer. `leaflet.heat` has no types, so require it for its side effect and call `(L as any).heatLayer`:
  ```tsx
  "use client";
  import { useEffect, useMemo, useRef } from "react";
  import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
  import L from "leaflet";
  import "leaflet.heat";
  import type { CityBuilding } from "@/types/city";

  function HeatLayer({ points }: { points: Array<[number, number, number]> }) {
    const map = useMap();
    const layerRef = useRef<L.Layer | null>(null);
    useEffect(() => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = (L as any).heatLayer(points, {
        radius: 14, blur: 18, maxZoom: 14,
        gradient: { 0.0: "#22c55e", 0.4: "#eab308", 0.7: "#f97316", 1.0: "#ef4444" },
      });
      layer.addTo(map);
      layerRef.current = layer;
      return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
    }, [map, points]);
    return null;
  }

  export function CityMap({
    buildings, showDac,
  }: { buildings: CityBuilding[]; showDac: boolean }) {
    // Normalize fine to [0,1] for heat weight; cap at the 95th-percentile so a few
    // mega-fines don't flatten the gradient.
    const points = useMemo<Array<[number, number, number]>>(() => {
      const fines = buildings.map((b) => b.fine2030Usd).filter((f) => f > 0).sort((a, b) => a - b);
      const cap = fines.length ? fines[Math.floor(fines.length * 0.95)] || fines[fines.length - 1] : 1;
      return buildings.map((b) => [b.lat, b.lon, Math.min(1, b.fine2030Usd / Math.max(1, cap))]);
    }, [buildings]);

    const dacPoints = useMemo(() => (showDac ? buildings.filter((b) => b.isDac) : []), [buildings, showDac]);

    return (
      <MapContainer center={[40.7128, -73.96]} zoom={11} style={{ height: "70vh", width: "100%", borderRadius: 16 }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <HeatLayer points={points} />
        {dacPoints.map((b) => (
          <CircleMarker key={b.bbl} center={[b.lat, b.lon]} radius={2} pathOptions={{ color: "#38bdf8", weight: 1, fillOpacity: 0.5 }} />
        ))}
      </MapContainer>
    );
  }
  ```
- [ ] 5. Create `app/city/page.tsx` — server component that reads the committed aggregate at build/request time, passes it to a client island. Leaflet must not SSR, so the map + interactive bits live in a client child loaded via `next/dynamic` with `ssr: false`. Create the client island inline as `app/city/CityView.tsx`:

  Create `app/city/CityView.tsx`:
  ```tsx
  "use client";
  import dynamic from "next/dynamic";
  import { useMemo, useState } from "react";
  import type { CityAggregate, CityBuilding } from "@/types/city";
  import { PortfolioFilter } from "@/components/PortfolioFilter";
  import type { PortfolioResult } from "@/lib/city/portfolio";

  const CityMap = dynamic(() => import("@/components/CityMap").then((m) => m.CityMap), { ssr: false });

  export function CityView({ agg }: { agg: CityAggregate }) {
    const [showDac, setShowDac] = useState(false);
    const [portfolio, setPortfolio] = useState<PortfolioResult | null>(null);

    const shown: CityBuilding[] = portfolio ? portfolio.rows : agg.buildings;
    const banner = useMemo(() => {
      if (portfolio) return {
        count: portfolio.subtotal.buildingCount, over: portfolio.subtotal.buildingsOver2030,
        tons: portfolio.subtotal.totalTonsOver2030, dollars: portfolio.subtotal.totalFine2030Usd, scope: "portfolio",
      };
      return {
        count: agg.summary.pricedBuildingCount, over: agg.summary.buildingsOver2030,
        tons: agg.summary.totalTonsOver2030, dollars: agg.summary.totalFine2030Usd, scope: "all covered NYC",
      };
    }, [portfolio, agg]);

    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">NYC at LL97 scale — the 2030 cliff, citywide</h1>
          <p className="text-sm opacity-70">
            Engine ran on every covered building with public data. Heat = annual 2030-2034 fine exposure. Every number is code-computed.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Buildings" value={banner.count.toLocaleString()} />
          <Stat label="Over 2030 limit" value={banner.over.toLocaleString()} />
          <Stat label="Tons over / yr" value={Math.round(banner.tons).toLocaleString()} />
          <Stat label="Fine exposure / yr" value={`$${Math.round(banner.dollars).toLocaleString()}`} accent />
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <CityMap buildings={shown} showDac={showDac} />
          <aside className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showDac} onChange={(e) => setShowDac(e.target.checked)} />
              Show NYS disadvantaged-community buildings
            </label>
            <PortfolioFilter buildings={agg.buildings} onResult={setPortfolio} />
            <p className="text-[11px] leading-snug opacity-60">
              Scope: {banner.scope}. Estimates over public LL84 + DOB Covered Buildings List data; the official compliance figure requires a registered design professional. {agg.summary.skippedNoLl84.toLocaleString()} covered BBLs had no public energy filing and are not shown.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-rose-400" : ""}`}>{value}</div>
      </div>
    );
  }
  ```

  Create `app/city/page.tsx`:
  ```tsx
  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";
  import type { CityAggregate } from "@/types/city";
  import { CityView } from "./CityView";

  export const dynamic = "force-static";

  function loadAggregate(): CityAggregate {
    const path = resolve(process.cwd(), "data/cache/city-aggregate.json");
    return JSON.parse(readFileSync(path, "utf8")) as CityAggregate;
  }

  export default function CityPage() {
    const agg = loadAggregate();
    return <CityView agg={agg} />;
  }
  ```
- [ ] 6. Type-check then build:
  ```bash
  npx tsc --noEmit && npm run build
  ```
  Expected: both pass. If `leaflet.heat` triggers a type error, confirm `import "leaflet.heat";` is a bare side-effect import and the `(L as any).heatLayer` cast is present. If `window is not defined` appears at build, confirm `CityMap` is only imported via the `ssr: false` dynamic import in `CityView.tsx` (never directly in a server component).
- [ ] 7. Screenshot-verify the rendered page. Serve the prod build and shoot it:
  ```bash
  pkill -f "next start" 2>/dev/null; npm start &
  sleep 4
  node /tmp/shots/shot.mjs http://localhost:3000/city /tmp/shots/city
  ```
  Then **Read** the PNG(s) in `/tmp/shots/city/` to confirm: the dark basemap renders, the heatmap overlay is visible (green→red points), the four-stat banner shows non-zero tons + $ exposure, and the portfolio sidebar is present. Toggle DAC by re-shooting after the build if needed. Fix any layout/contrast issues (e.g. map tiles not loading offline is acceptable for the demo note; heat points must render). Then `pkill -f "next start"`.
- [ ] 8. Commit:
  ```bash
  git add components/CityMap.tsx components/PortfolioFilter.tsx components/FinancingList.tsx app/city/page.tsx app/city/CityView.tsx app/globals.css
  git commit -m "feat(p2): city Leaflet heatmap + aggregate banner + portfolio filter + financing/equity views

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 7 — Wire financing matcher into the advise/optimize path (integration)

The financing matcher must surface in the single-building flow (per the spec's §6.6), driven by the code-computed `fineAvoidedByMeasure` from the optimizer/ROI — not recomputed in the UI.

**Files**
- Modify: `app/api/advise/route.ts` (attach `financing: MeasureFinancing[]` to the response, computed from the same candidates)
- Modify: the result/plan view component from P1 (e.g. `components/ResultCard.tsx` or the plan section) to render `<FinancingList items={financing} />`
- Test: `test/finance/match.integration.test.ts`

**Steps**
- [ ] 1. Write the integration test `test/finance/match.integration.test.ts` asserting that, given a realistic candidate set, the matcher attaches programs to each recommended measure and the financing-only flags are correct:
  ```ts
  import { describe, it, expect } from "vitest";
  import { matchFinancing } from "@/lib/finance/match";
  import { MEASURES } from "@/data/catalogs/measures";
  import { REBATES } from "@/data/catalogs/rebates";

  describe("financing integration", () => {
    it("attaches programs to each recommended measure from a candidate plan", () => {
      const recommended = ["heat-pump", "controls", "envelope"];
      const fineAvoidedByMeasure = { "heat-pump": 180000, controls: 40000, envelope: 30000 };
      const out = matchFinancing(recommended, {
        measures: MEASURES, rebates: REBATES, fuels: ["gas", "steam"],
        units: 80, isMultifamily: true, affordable: true, fineAvoidedByMeasure,
      });
      expect(out.map((m) => m.measureKey)).toEqual(recommended);
      for (const m of out) {
        expect(m.programs.length).toBeGreaterThan(0);
        // every measure shows at least one real federal/state/utility/city program
        expect(m.programs.some((p) => /Con Ed|NYSERDA|IRS|C-PACE|HPD|Accelerator|Clean Heat/i.test(p.name))).toBe(true);
      }
      // affordable building => income-restricted AHRF surfaces
      const hp = out[0];
      expect(hp.programs.some((p) => /AHRF|HPD|Affordable Multifamily/i.test(p.name))).toBe(true);
    });
  });
  ```
- [ ] 2. Run it, expect PASS (matcher already exists from Task 4; this guards the integration shape):
  ```bash
  npx vitest run test/finance/match.integration.test.ts
  ```
  Expected: green. If a measure has zero programs, the catalog/measure-key linkage is wrong — fix `measures` in the program objects, not the test.
- [ ] 3. In `app/api/advise/route.ts`, after building the ranked `FixCandidate[]` (which already carry `measureKey` and `fineAvoidedUSD`), compute `financing` and include it in the JSON response. Add (adapting to the route's existing variable names — `facts`, `candidates`, the resolved `units`/`affordable`/`fuels`):
  ```ts
  import { matchFinancing } from "@/lib/finance/match";
  import { MEASURES } from "@/data/catalogs/measures";
  import { REBATES } from "@/data/catalogs/rebates";
  // ... inside the handler, after `candidates`/`plan` are built:
  const fineAvoidedByMeasure = Object.fromEntries(
    plan.rankedFixes.map((f) => [f.measureKey, f.fineAvoidedUSD]),
  );
  const financing = matchFinancing(
    plan.rankedFixes.map((f) => f.measureKey),
    {
      measures: MEASURES,
      rebates: REBATES,
      fuels, // the building's fuels, already derived in this handler
      units, // already derived (null if GFA unknown)
      isMultifamily, // already derived
      affordable, // the Article-321 toggle / affordable flag already in scope
      fineAvoidedByMeasure,
    },
  );
  return Response.json({ ...plan, financing });
  ```
  (If `fuels`/`units`/`isMultifamily`/`affordable` are not yet derived in this handler, derive them from `facts` the same way `lib/advise/roi.ts` does: fuels via the energy fields, `units = gfa>0 ? max(1, round(gfa/900)) : null`, `isMultifamily` via primary type, `affordable` from the request's `facts.isArticle321`/toggle.)
- [ ] 4. Render it. In the P1 plan/result component, import and place `<FinancingList items={financing} />` under the ranked fixes, reading `financing` off the advise response. (The component is already built in Task 6.)
- [ ] 5. Type-check + build + full suite:
  ```bash
  npx tsc --noEmit && npm run build && npx vitest run
  ```
  Expected: all pass.
- [ ] 6. Screenshot-verify the single-building plan shows the financing list. Serve, shoot the home/result page after running a cached building, Read the PNG to confirm each recommended measure lists real programs with net cost + payback. Then `pkill -f "next start"`.
- [ ] 7. Commit:
  ```bash
  git add app/api/advise/route.ts test/finance/match.integration.test.ts components/
  git commit -m "feat(p2): surface financing matcher in single-building advise flow

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8 — Final phase verification

**Files** (no new files; verification only)

**Steps**
- [ ] 1. Full green suite:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run
  ```
  Expected: every test passes, including `test/city/aggregate.test.ts`, `test/equity/dac.test.ts`, `test/city/portfolio.test.ts`, `test/finance/match.test.ts`, `test/finance/match.integration.test.ts`, `test/city/sanity.test.ts` (with the file-backed case running and passing).
- [ ] 2. Type + build:
  ```bash
  npx tsc --noEmit && npm run build
  ```
  Expected: clean.
- [ ] 3. Offline-demo confirmation: with networking disabled, the `/city` page must still render from the committed `data/cache/city-aggregate.json` (basemap tiles may not load offline; the heatmap overlay, banner, portfolio, and equity toggle must). Note the tile-offline caveat in the demo script if relevant.
- [ ] 4. Print the precompute summary one more time and record it in the commit/PR description for judges:
  ```bash
  node -e "const a=require('./data/cache/city-aggregate.json');console.log(JSON.stringify(a.summary,null,2));"
  ```
  Expected: priced buildings in the thousands; over-2030 share ~40-75%; total $ exposure in the hundreds of millions.
- [ ] 5. Commit any final tweaks:
  ```bash
  git add -A && git commit -m "chore(p2): final verification — suite green, build clean, offline demo confirmed

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Self-check — every P2 spec item maps to a task

| Spec item (§6.5 / §6.6) | Task(s) |
|---|---|
| `scripts/precompute-city.ts`: iterate CBL covered BBLs, join LL84 from **local SQLite** (not live), `computeAllPeriods` → compact `data/cache/city-aggregate.json` (`{bbl, lat, lon, emissionsTco2e, limit2030Tco2e, fine2030Usd, neighborhood}`) | Task 0 (types), Task 1 (reducer), Task 5 (script) |
| Skip/flag buildings lacking data | Task 1 (`buildCityRow` returns null), Task 5 (`skippedNoLl84`/`skippedNoGeo`/`skippedNoEmissions` counters) |
| Emit a summary (count, total tons over 2030, total $ exposure) | Task 1 (`summarizeCity`), Task 5 (console summary block) |
| Order-of-magnitude sanity check vs ~50k buildings / 2030 projections (~57% over) | Task 5 (`lib/city/sanity.ts` + `test/city/sanity.test.ts`, unit + file-backed) |
| `app/city/page.tsx` + `components/CityMap.tsx`: react-leaflet heatmap colored by `fine2030Usd`, loads aggregate, aggregate stat banner, **no Mapbox token** | Task 6 |
| `components/PortfolioFilter.tsx`: filter by owner / pasted BBL list → subtotal | Task 3 (`parseBblList`/`filterPortfolio`), Task 6 (component) |
| `components/FinancingList.tsx`: map each recommended measure → matched real programs (NYSERDA, Con Ed, IRA §179D & 48 ITC, C-PACE, NYC AHRF/REDi) with net cost + payback | Task 4 (matcher + C-PACE/AHRF catalog), Task 6 (component), Task 7 (wired into advise flow) |
| Re-verify IRA §179D/§45L figures (shifted 2025) note | Task 4 (catalog comment), Task 6 (FinancingList footnote) |
| `data/dac/disadvantaged.json` (NYS DAC/EJ flags, source described + small committed sample) | Task 2 |
| Overlay on the map | Task 2 (data), Task 6 (DAC toggle + CircleMarker layer) |
| Auto-flag Article 321 eligibility + AHRF for qualifying buildings | Task 2 (`equityFlags`), Task 4 (AHRF income-restricted gating), Task 5 (`isDac` join in precompute) |
| Tested flagging logic | Task 2 (`test/equity/dac.test.ts`) |

**Placeholders:** none. Every code block is complete and runnable; no "TBD" / "add error handling later" / "similar to above".

**Types match contract:** `BuildingInput`/`computeAllPeriods`/`FineResult` consumed exactly as frozen in the index; `Measure`/`RebateProgram`/`MatchedRebate` reused from `types/advise.ts` / `data/catalogs/types.ts`; new `types/city.ts` and `types/equity.ts` are additive (the contract permits a phase to add new types). API routes return `Response.json(...)` (Next 16), never `NextResponse`. The one rule holds: every emissions/limit/fine/cost/payback/aggregate is code-computed; Claude touches none of it in this phase.
