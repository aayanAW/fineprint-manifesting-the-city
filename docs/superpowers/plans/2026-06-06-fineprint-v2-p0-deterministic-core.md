# FinePrint v2 — P0 Deterministic Core — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax; check each as you finish it. Every code step contains COMPLETE code — type it verbatim, do not paraphrase. Implement against the LOCKED INTERFACE CONTRACT in `docs/superpowers/plans/2026-06-06-fineprint-v2-implementation-index.md` exactly; never rename a contract field.

**Goal:** Build the deterministic core of FinePrint v2 — a remade, pure, tested NYC Local Law 97 engine plus a public-data lookup layer with a local SQLite cache and an honest single-building result card whose centerpiece is the **2030 cliff** (a building that is compliant 2024-2029 but goes red in 2030-2034). No AI in this phase. Every number is computed by code; nothing is invented. Demo must run end-to-end offline from committed fixtures and a pre-warmed cache.

**Architecture:**
- `lib/ll97/{constants,engine,emissions}.ts` — pure deterministic engine. `constants.ts` holds the 60-row ESPM factor table + penalty rate, each block sourced in a comment to `1 RCNY §103-14`. `engine.ts` exports `computeFine` / `computeAllPeriods` / Article-321 handling per contract. `emissions.ts` exports `recomputeEmissions` (DOB-basis recompute from fuel columns, period-specific electricity coefficient).
- `lib/data/{types,geosearch,ll84,coveredBuildings,lookup,cache}.ts` — the data pipeline. `geosearch` resolves an address to a BBL (DOF-aware: among candidates that share the queried house number, prefer the highest-ranked one the CBL knows). `ll84` parses Socrata `5zyy-y8am` (latest filing wins, `"Not Available" → null`, LL84 use-names mapped to ESPM vocabulary). `coveredBuildings` loads `data/cbl/cbl26.json.gz`. `lookup` orchestrates all three into `BuildingFacts` with per-field provenance. `cache` reads/writes building facts in a local SQLite file (`better-sqlite3`).
- `scripts/fetch-ll84.ts` — one-time Socrata → SQLite warmer; also pre-caches the 3 demo buildings, whose JSON is committed as fixtures so the demo runs offline.
- `app/api/building/route.ts` — `POST {address|bbl} → { facts, fines }` returning `Response.json(...)` (Next 16 idiom; never `NextResponse`).
- `app/page.tsx` + `components/{SearchBar,ResultCard,CliffChart,ProvenanceFootnote}.tsx` — the UI. `CliffChart` is a Recharts bar chart (per-period emissions bars + two limit reference lines; the 2030 number turns red when over). `ProvenanceFootnote` renders `FineResult.notes` + `BuildingFacts.provenance` verbatim.
- **The one inviolable rule:** code computes every number; in P0 there is no AI path at all, so this is trivially satisfied — but the data structures (`FineResult.notes`, `BuildingFacts.provenance`) are designed so that when P1 adds Claude, the model only narrates these arrays, never recomputes.

**Tech Stack:** Next.js 16.2.7 (App Router) · React 19.2.4 · TypeScript 5 · Tailwind v4 (CSS-first, `@tailwindcss/postcss`, no config file) · Recharts 3 · `better-sqlite3` · Vitest 4 + jsdom + `@testing-library/react` · `vite-tsconfig-paths`. Deployed on Vercel. Engine/data are TDD; UI is verified by `npm run build` + headless-Chromium screenshots.

---

## Task 0 — Remake protocol: relocate carried-over code, restore the Next 16 stack

Integrity step. The carried-over `lib/`, `types/`, `test/` from the original FinePrint are moved into `reference/` (read-only); all engine/data code below is re-derived fresh into a new `lib/`. The CBL snapshot is a public dataset, reused as data. We also restore the full Next 16 + Tailwind v4 build so later tasks have a working app shell. This task is config/scaffolding (no engine logic), so it has no unit test of its own — it is verified by `npx tsc --noEmit` succeeding on an empty `lib/` and `npm run build` succeeding after the app shell exists (Task 9 re-verifies the full build).

**Files**
- Modify: `package.json`
- Create: `tsconfig.json` (overwrite), `next.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `.gitignore` (overwrite), `reference/README.md`
- Move: `lib/` → `reference/lib/`, `types/` → `reference/types/`, `test/` → `reference/test/`, `vitest.config.ts` stays (rewritten below)

**Steps**

- [ ] Relocate the carried-over code to `reference/` (read-only seed), keeping the public CBL dataset and catalogs in place:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  mkdir -p reference
  git mv lib reference/lib
  git mv types reference/types
  git mv test reference/test
  ```
  (`data/catalogs/` and any future `data/cbl/` stay at the repo root — they are data, not carried logic.)

- [ ] Create `reference/README.md` documenting that this tree is read-only:
  ```markdown
  # reference/ — read-only seed

  Carried-over code from the original FinePrint (`lib/`, `types/`, `test/`) and notes
  pointing at the parallel build `github.com/aaravmin/fineprint`. **Do not import from
  here in production code.** Every engine/data value in `lib/` is re-derived fresh and
  validated against the golden DOB worked example. This tree exists only as a cross-check
  during the remake.
  ```

- [ ] Bring the CBL snapshot in as data (public dataset, reused; loader is remade in Task 6):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  mkdir -p data/cbl
  cp /tmp/aaravmin-fineprint/data/cbl/cbl26.json.gz data/cbl/cbl26.json.gz
  ```

- [ ] Overwrite `package.json` with the full Next 16 stack (engine deps + UI deps + cache dep):
  ```json
  {
    "name": "fineprint-manifesting-the-city",
    "version": "0.1.0",
    "private": true,
    "description": "FinePrint — Manifesting the City. NYC Local Law 97 compliance copilot. Deterministic engine owns every number; Claude only ranks/explains/narrates/cites.",
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "test": "vitest run",
      "test:watch": "vitest",
      "typecheck": "tsc --noEmit",
      "fetch-ll84": "tsx scripts/fetch-ll84.ts"
    },
    "dependencies": {
      "@anthropic-ai/sdk": "^0.100.1",
      "better-sqlite3": "^11.8.1",
      "next": "16.2.7",
      "react": "19.2.4",
      "react-dom": "19.2.4",
      "recharts": "^3.8.1"
    },
    "devDependencies": {
      "@tailwindcss/postcss": "^4",
      "@testing-library/jest-dom": "^6.9.1",
      "@testing-library/react": "^16.3.2",
      "@types/better-sqlite3": "^7.6.12",
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "@vitejs/plugin-react": "^6.0.2",
      "jsdom": "^29.1.1",
      "tailwindcss": "^4",
      "tsx": "^4.19.2",
      "typescript": "^5",
      "vite-tsconfig-paths": "^6.1.1",
      "vitest": "^4.1.8"
    }
  }
  ```

- [ ] Install dependencies:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npm install
  ```
  Expected: completes without error; `node_modules/next/package.json` reports `16.2.7`.

- [ ] Overwrite `tsconfig.json` for Next 16 (JSX, the `next` plugin, the `@/*` path alias):
  ```json
  {
    "compilerOptions": {
      "target": "ES2017",
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "skipLibCheck": true,
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "jsx": "react-jsx",
      "incremental": true,
      "plugins": [{ "name": "next" }],
      "paths": { "@/*": ["./*"] }
    },
    "include": [
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts"
    ],
    "exclude": ["node_modules", "reference"]
  }
  ```
  (`reference/` is excluded so the read-only seed never breaks the type check.)

- [ ] Create `next.config.ts`:
  ```ts
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    // better-sqlite3 is a native addon; keep it external to the server bundle.
    serverExternalPackages: ["better-sqlite3"],
  };

  export default nextConfig;
  ```

- [ ] Create `postcss.config.mjs` (Tailwind v4 plugin):
  ```js
  const config = {
    plugins: {
      "@tailwindcss/postcss": {},
    },
  };

  export default config;
  ```

- [ ] Create `app/globals.css` (Tailwind v4 CSS-first import + design tokens + motion keyframes honoring `prefers-reduced-motion`):
  ```css
  @import "tailwindcss";

  :root {
    --background: #fcfcfb;
    --foreground: #101010;
    --over: #c0341d;       /* fine / over-the-cap red */
    --under: #1f7a4d;      /* compliant green */
    --muted: #6b6b6b;
    --hairline: #e6e6e3;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }

  @theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-over: var(--over);
    --color-under: var(--under);
    --color-muted: var(--muted);
    --color-hairline: var(--hairline);
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);
  }

  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  }

  @keyframes fp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fp-pop  { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
  @keyframes fp-fade { from { opacity: 0; } to { opacity: 1; } }
  .fp-rise { animation: fp-rise 320ms var(--ease-out) both; }
  .fp-pop  { animation: fp-pop 170ms var(--ease-out) both; transform-origin: top; }

  @media (prefers-reduced-motion: reduce) {
    .fp-rise, .fp-pop { animation: fp-fade 200ms ease both !important; }
  }
  ```

- [ ] Create `app/layout.tsx`:
  ```tsx
  import type { Metadata } from "next";
  import { Geist, Geist_Mono } from "next/font/google";
  import "./globals.css";

  const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
  const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

  export const metadata: Metadata = {
    title: "FinePrint — your building's Local Law 97 carbon fine",
    description:
      "Enter a NYC address to see its real Local Law 97 carbon penalty across every compliance period — and the 2030 cliff.",
  };

  export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    );
  }
  ```

- [ ] Overwrite `vitest.config.ts` to run node engine/data tests AND jsdom component tests, with the `@/*` alias resolved:
  ```ts
  import { defineConfig } from "vitest/config";
  import react from "@vitejs/plugin-react";
  import tsconfigPaths from "vite-tsconfig-paths";

  export default defineConfig({
    plugins: [tsconfigPaths(), react()],
    test: {
      globals: true,
      // node for pure engine/data logic; jsdom only where a test opts in via a
      // `// @vitest-environment jsdom` file pragma (component tests).
      environment: "node",
      include: ["test/**/*.test.ts", "test/**/*.test.tsx", "lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.tsx"],
      setupFiles: ["test/setup.ts"],
    },
  });
  ```

- [ ] Create `test/setup.ts` (jest-dom matchers for the component tests; harmless in node):
  ```ts
  import "@testing-library/jest-dom/vitest";
  ```

- [ ] Overwrite `.gitignore`:
  ```gitignore
  node_modules/
  .next/
  .vercel/
  *.tsbuildinfo
  .DS_Store
  .env*.local
  next-env.d.ts
  ```

- [ ] Verify the empty shell type-checks and an empty test run is green (no engine yet):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx tsc --noEmit && npx vitest run
  ```
  Expected: `tsc` prints nothing (exit 0); vitest reports `No test files found` or exits 0. (If vitest errors on zero files, that is fine — Task 1 adds the first test.)

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add -A
  git commit -m "chore(p0): remake protocol — relocate seed to reference/, restore Next 16 + Tailwind v4 stack

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 1 — Engine constants (`lib/ll97/constants.ts`), transcribed verbatim from 1 RCNY §103-14

The 60-row ESPM factor table, penalty rate, and period column index. Every block is sourced in a comment to the rule. Values are transcribed from `docs/references/rcny_103_14.pdf` and cross-checked against both reference implementations (`reference/lib/ll97/coefficients.ts` and `/tmp/aaravmin-fineprint/engine/src/constants.ts`).

**Files**
- Create: `lib/ll97/constants.ts`
- Test: `test/ll97/constants.test.ts`

**Steps**

- [ ] Write the failing test `test/ll97/constants.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    PENALTY_RATE_CENTS_PER_TCO2E,
    PERIODS,
    PERIOD_COLUMN,
    ESPM_FACTORS_TCO2E_PER_SQFT,
  } from "@/lib/ll97/constants";

  describe("LL97 constants — 1 RCNY §103-14", () => {
    it("penalty rate is $268/tCO2e expressed as integer cents", () => {
      expect(PENALTY_RATE_CENTS_PER_TCO2E).toBe(26_800);
    });

    it("declares the three compliance periods in order", () => {
      expect(PERIODS).toEqual(["2024-2029", "2030-2034", "2035-2039"]);
      expect(PERIOD_COLUMN).toEqual({ "2024-2029": 0, "2030-2034": 1, "2035-2039": 2 });
    });

    it("Multifamily Housing factors match the rule (0.00675 / 0.00334664 / 0.002692183)", () => {
      expect(ESPM_FACTORS_TCO2E_PER_SQFT["Multifamily Housing"]).toEqual([
        0.00675, 0.00334664, 0.002692183,
      ]);
    });

    it("Office factors match the rule (0.00758 / 0.002690852 / 0.00165234)", () => {
      expect(ESPM_FACTORS_TCO2E_PER_SQFT["Office"]).toEqual([
        0.00758, 0.002690852, 0.00165234,
      ]);
    });

    it("has all 60 ESPM property types", () => {
      expect(Object.keys(ESPM_FACTORS_TCO2E_PER_SQFT)).toHaveLength(60);
    });

    it("the electricity-greening intuition holds: every type's 2035 factor < its 2024 factor", () => {
      for (const [, [f2024, , f2035]] of Object.entries(ESPM_FACTORS_TCO2E_PER_SQFT)) {
        expect(f2035).toBeLessThan(f2024);
      }
    });
  });
  ```

- [ ] Run it — expect FAIL (module does not exist yet):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/constants.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/ll97/constants'`.

- [ ] Create `lib/ll97/constants.ts` (complete, all 60 rows transcribed verbatim):
  ```ts
  // FinePrint v2 engine constants — deterministic, sourced verbatim from primary law.
  //
  // Penalty rate for exceeding the building emissions limit:
  //   "...the difference between the building emissions limit established for a
  //    calendar year and the actual emissions reported for such calendar year in
  //    the building emissions report, multiplied by $268."
  // Source: 1 RCNY §103-14(h) (implements NYC Admin Code §28-320.6).
  // https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf — verified 2026-06-06.
  // Money is handled in integer cents internally to avoid float drift.
  export const PENALTY_RATE_CENTS_PER_TCO2E = 26_800;

  export type Period = "2024-2029" | "2030-2034" | "2035-2039";
  export const PERIODS: Period[] = ["2024-2029", "2030-2034", "2035-2039"];

  // Column index of each period in the factor tuples below.
  export const PERIOD_COLUMN: Record<Period, 0 | 1 | 2> = {
    "2024-2029": 0,
    "2030-2034": 1,
    "2035-2039": 2,
  };

  // Building emissions-intensity limits ("emissions factors"), tCO2e per sf, by
  // Energy Star Portfolio Manager (ESPM) property type. DOB assigns each space an
  // ESPM type; a mixed-use limit is the sum of (factor × floor area) over types.
  // Columns: [2024-2029, 2030-2034, 2035-2039].
  // Source: 1 RCNY §103-14(d)(3)(i), (iii), (iv). All three columns transcribed
  // verbatim from the rule PDF (docs/references/rcny_103_14.pdf) — verified 2026-06-06.
  export const ESPM_FACTORS_TCO2E_PER_SQFT: Record<string, readonly [number, number, number]> = {
    "Adult Education": [0.00758, 0.003565528, 0.002674146],
    "Ambulatory Surgical Center": [0.01181, 0.008980612, 0.006735459],
    "Automobile Dealership": [0.00675, 0.002824097, 0.002118072],
    "Bank Branch": [0.00987, 0.004036172, 0.003027129],
    "Bowling Alley": [0.00574, 0.003103815, 0.002327861],
    "College/University": [0.00987, 0.002099748, 0.001236322],
    "Convenience Store without Gas Station": [0.00675, 0.003540032, 0.002655024],
    Courthouse: [0.00426, 0.001480533, 0.0011104],
    "Data Center": [0.02381, 0.014791131, 0.011093348],
    "Distribution Center": [0.00574, 0.0009916, 0.000549637],
    "Enclosed Mall": [0.01074, 0.003983803, 0.002987852],
    "Financial Office": [0.00846, 0.003697004, 0.002772753],
    "Fitness Center/Health Club/Gym": [0.00987, 0.003946728, 0.002960046],
    "Food Sales": [0.01181, 0.00520888, 0.00390666],
    "Food Service": [0.01181, 0.007749414, 0.00581206],
    "Hospital (General Medical & Surgical)": [0.02381, 0.007335204, 0.004654044],
    Hotel: [0.00987, 0.003850668, 0.002640017],
    "K-12 School": [0.00675, 0.002230588, 0.001488109],
    Laboratory: [0.02381, 0.026029868, 0.019522401],
    Library: [0.00675, 0.002218412, 0.001663809],
    "Lifestyle Center": [0.00846, 0.00470585, 0.003529387],
    "Mailing Center/Post Office": [0.00426, 0.00198044, 0.00148533],
    "Manufacturing/Industrial Plant": [0.00758, 0.00141703, 0.000975993],
    "Medical Office": [0.01074, 0.002912778, 0.001683565],
    "Movie Theater": [0.01181, 0.005395268, 0.004046451],
    "Multifamily Housing": [0.00675, 0.00334664, 0.002692183],
    Museum: [0.01181, 0.0053958, 0.00404685],
    "Non-Refrigerated Warehouse": [0.00426, 0.000883187, 0.000568051],
    Office: [0.00758, 0.002690852, 0.00165234],
    "Other - Education": [0.00846, 0.002934006, 0.001867699],
    "Other - Entertainment/Public Assembly": [0.00987, 0.002956738, 0.002250122],
    "Other - Lodging/Residential": [0.00758, 0.001901982, 0.001329089],
    "Other - Mall": [0.01074, 0.001928226, 0.001006426],
    "Other - Public Services": [0.00758, 0.003808033, 0.002856025],
    "Other - Recreation": [0.00987, 0.00447957, 0.003359678],
    "Other - Restaurant/Bar": [0.02381, 0.008505075, 0.006378806],
    "Other - Services": [0.01074, 0.001823381, 0.001367536],
    "Other - Specialty Hospital": [0.02381, 0.006321819, 0.004741365],
    "Other - Technology/Science": [0.02381, 0.010446456, 0.007834842],
    "Outpatient Rehabilitation/Physical Therapy": [0.01181, 0.006018323, 0.004513742],
    Parking: [0.00426, 0.000214421, 0.000104943],
    "Performing Arts": [0.00846, 0.002472539, 0.001399345],
    "Personal Services (Health/Beauty, Dry Cleaning, etc.)": [0.00574, 0.004843037, 0.003632278],
    "Pre-school/Daycare": [0.00675, 0.002362874, 0.001772155],
    "Refrigerated Warehouse": [0.00987, 0.002852131, 0.002139098],
    "Repair Services (Vehicle, Shoe, Locksmith, etc.)": [0.00426, 0.002210699, 0.001658024],
    "Residence Hall/Dormitory": [0.00758, 0.002464089, 0.001332459],
    "Residential Care Facility": [0.01138, 0.004893124, 0.004027812],
    Restaurant: [0.01181, 0.004038374, 0.00302878],
    "Retail Store": [0.00758, 0.00210449, 0.00121605],
    "Self-Storage Facility": [0.00426, 0.00061183, 0.000404901],
    "Senior Care Community": [0.01138, 0.004410123, 0.003336443],
    "Social/Meeting Hall": [0.00987, 0.003833108, 0.002874831],
    "Strip Mall": [0.01181, 0.001361842, 0.000600493],
    "Supermarket/Grocery Store": [0.02381, 0.00675519, 0.004256103],
    "Transportation Terminal/Station": [0.00426, 0.000571669, 0.000428752],
    "Urgent Care/Clinic/Other Outpatient": [0.01181, 0.005772375, 0.004329281],
    "Vocational School": [0.00574, 0.004613122, 0.003459842],
    "Wholesale Club/Supercenter": [0.01138, 0.004264962, 0.003198721],
    "Worship Facility": [0.00574, 0.001230602, 0.000866921],
  };

  // LL84 self-reported property-type labels that differ from the rule's ESPM keys.
  // Folded in by the engine's label resolver so a live filing's variant still
  // prices correctly. Exact renames (nothing to disclose) live here; proxies that
  // are editorial judgment are surfaced separately in the data layer (lib/data/ll84.ts).
  export const PROPERTY_TYPE_ALIASES: Record<string, string> = {
    "Senior Living Community": "Senior Care Community",
    "Vehicle Dealership": "Automobile Dealership",
    "Vehicle Repair Services": "Repair Services (Vehicle, Shoe, Locksmith, etc.)",
    "Repair Services": "Repair Services (Vehicle, Shoe, Locksmith, etc.)",
    "Bar/Nightclub": "Other - Restaurant/Bar",
    "Restaurant/Bar": "Other - Restaurant/Bar",
    "Community Center": "Social/Meeting Hall",
    "Community Center and Social Meeting Hall": "Social/Meeting Hall",
    "Social Meeting Hall": "Social/Meeting Hall",
    "Convenience Store with Gas Station": "Convenience Store without Gas Station",
    "Mailing Center/Post Office (Non-Operational)": "Mailing Center/Post Office",
    "Personal Services (Health/Beauty, Dry Cleaning, etc)":
      "Personal Services (Health/Beauty, Dry Cleaning, etc.)",
  };
  ```

- [ ] Run the test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/constants.test.ts
  ```
  Expected: PASS (6 tests).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/ll97/constants.ts test/ll97/constants.test.ts
  git commit -m "feat(engine): remade LL97 constants — 60-row ESPM table + penalty rate, sourced to 1 RCNY §103-14

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 2 — Property-type label resolver (`factorFor`) in `lib/ll97/engine.ts` (internal)

Before `computeFine`, the engine needs to map a live LL84 label to its ESPM factor through exact → alias → normalized matching, so case/whitespace/punctuation variants of an alias key never silently drop a use-type from the cap. We build this resolver first and test it in isolation; `computeFine` (Task 3) will consume it.

**Files**
- Create: `lib/ll97/engine.ts` (resolver only in this task; `computeFine` added in Task 3)
- Test: `test/ll97/factorFor.test.ts`

**Steps**

- [ ] Write the failing test `test/ll97/factorFor.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { factorFor } from "@/lib/ll97/engine";

  describe("factorFor — exact → alias → normalized", () => {
    it("resolves an exact ESPM key", () => {
      expect(factorFor("Multifamily Housing", "2024-2029")).toBe(0.00675);
      expect(factorFor("Office", "2030-2034")).toBe(0.002690852);
    });

    it("resolves an alias key", () => {
      expect(factorFor("Senior Living Community", "2024-2029")).toBe(0.01138);
      expect(factorFor("Vehicle Dealership", "2024-2029")).toBe(0.00675);
    });

    it("resolves a case/whitespace variant of an alias", () => {
      expect(factorFor("senior living community", "2024-2029")).toBe(0.01138);
      expect(factorFor("Senior Living Community ", "2024-2029")).toBe(0.01138);
    });

    it("resolves a punctuation variant ('bar/nightclub' → Other - Restaurant/Bar)", () => {
      expect(factorFor("bar/nightclub", "2024-2029")).toBe(0.02381);
    });

    it("resolves a trailing-space variant of an exact key in any period", () => {
      expect(factorFor("office ", "2035-2039")).toBe(0.00165234);
    });

    it("returns undefined for an unknown type (caller flags it; never silently 0)", () => {
      expect(factorFor("Nuclear Reactor", "2024-2029")).toBeUndefined();
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/factorFor.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/ll97/engine'` (or no export `factorFor`).

- [ ] Create `lib/ll97/engine.ts` with the resolver only (the rest of the engine is appended in Task 3):
  ```ts
  // Deterministic NYC Local Law 97 fine engine. Pure functions: same input, same
  // output, no clock, no network. Money handled in integer cents internally and
  // exposed as USD at the boundary; emissions are tCO2e.
  //
  // The one rule: this file computes numbers. The AI layer (P1) only narrates the
  // FineResult.notes[] these functions produce; it never recomputes.

  import {
    ESPM_FACTORS_TCO2E_PER_SQFT,
    PROPERTY_TYPE_ALIASES,
    PERIOD_COLUMN,
    type Period,
  } from "./constants";

  export type { Period };
  export { PERIODS } from "./constants";

  // ---- Contract types (LOCKED — do not rename fields) ------------------------

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
    overageTco2e: number; // 0 if compliant
    annualFineUsd: number; // 0 if compliant
    compliant: boolean;
    pathway: "standard" | "article321";
    notes: string[]; // honesty caveats, rendered verbatim
  }

  // ---- Property-type label resolver -----------------------------------------

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Build a normalized index once: every ESPM key plus every alias key, folded to
  // its factor tuple. Without folding aliases under their normalized form, a
  // case/space variant of an alias key falls through to undefined and silently
  // drops the use-type from the cap.
  let normIndex: Record<string, readonly [number, number, number]> | null = null;
  function getNormIndex(): Record<string, readonly [number, number, number]> {
    if (normIndex) return normIndex;
    const idx: Record<string, readonly [number, number, number]> = {};
    for (const [key, tuple] of Object.entries(ESPM_FACTORS_TCO2E_PER_SQFT)) {
      idx[norm(key)] = tuple;
    }
    for (const [aliasKey, canonical] of Object.entries(PROPERTY_TYPE_ALIASES)) {
      const tuple = ESPM_FACTORS_TCO2E_PER_SQFT[canonical];
      const nk = norm(aliasKey);
      if (tuple && idx[nk] === undefined) idx[nk] = tuple;
    }
    normIndex = idx;
    return idx;
  }

  // Resolve a property-type label to its emissions factor for a period.
  // exact ESPM key → exact alias → normalized (case/space/punctuation) → undefined.
  export function factorFor(group: string, period: Period): number | undefined {
    const col = PERIOD_COLUMN[period];
    const exact = ESPM_FACTORS_TCO2E_PER_SQFT[group];
    if (exact) return exact[col];
    const alias = PROPERTY_TYPE_ALIASES[group];
    if (alias && ESPM_FACTORS_TCO2E_PER_SQFT[alias]) {
      return ESPM_FACTORS_TCO2E_PER_SQFT[alias][col];
    }
    const tuple = getNormIndex()[norm(group)];
    return tuple ? tuple[col] : undefined;
  }
  ```

- [ ] Run the test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/factorFor.test.ts
  ```
  Expected: PASS (6 tests).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/ll97/engine.ts test/ll97/factorFor.test.ts
  git commit -m "feat(engine): property-type label resolver (exact→alias→normalized)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3 — `computeFine` / `computeAllPeriods` + the GOLDEN DOB worked-example test

The core. `computeFine(building, period)` sums per-group limits via `factorFor`, computes the overage and the $268/ton penalty (integer cents internally, rounded at the boundary), and flags any unresolved use-type in `notes`. `computeAllPeriods` maps over all three. The golden test reproduces DOB's published worked example **and** demonstrates the 2030 cliff (compliant in 2024-2029, over in 2030-2034 and 2035-2039).

**Golden building (DOB worked example, cross-checked by hand):**
44,800 sf Multifamily Housing; emissions 287.00 tCO2e (2024-2029 basis).
- 2024-2029: limit = 44,800 × 0.00675 = **302.40 tCO2e**; 287.00 < 302.40 → **compliant, $0**.
- 2030-2034: limit = 44,800 × 0.00334664 = **149.93 tCO2e** (149.929472, rounds to 149.93). With 2030 emissions 242.37 (electricity coefficient drops): overage **92.44**, fine **$24,773.53**. (See Task 4 for period-specific emissions; here the golden test pins the 2024 emissions=287.00 case across periods to isolate the limit cliff.)

To keep this task's golden test purely about the fine math (limits + penalty), we hold emissions constant at 287.00 across periods and assert the cliff in the limit alone; Task 4 adds the period-specific emissions recompute.

**Files**
- Modify: `lib/ll97/engine.ts` (append `computeFine`, `computeArticle321Result`, `computeAllPeriods`)
- Test: `test/ll97/engine.golden.test.ts`

**Steps**

- [ ] Write the failing golden test `test/ll97/engine.golden.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { computeFine, computeAllPeriods, type BuildingInput } from "@/lib/ll97/engine";

  // DOB published worked example: a 44,800 sf Multifamily Housing building.
  // 2024-2029 limit = 44,800 × 0.00675 = 302.40 tCO2e. Reported emissions 287.00.
  const dobExample: BuildingInput = {
    grossFloorAreaSqft: 44_800,
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 44_800 }],
    annualEmissionsTco2e: 287.0,
  };

  describe("computeFine — GOLDEN (DOB worked example, hand-checked)", () => {
    it("2024-2029: compliant, limit 302.40 tCO2e, fine $0", () => {
      const r = computeFine(dobExample, "2024-2029");
      expect(r.emissionsLimitTco2e).toBeCloseTo(302.4, 2);
      expect(r.actualEmissionsTco2e).toBe(287.0);
      expect(r.overageTco2e).toBe(0);
      expect(r.annualFineUsd).toBe(0);
      expect(r.compliant).toBe(true);
      expect(r.pathway).toBe("standard");
    });

    it("THE 2030 CLIFF: same emissions, 2030-2034 limit drops to 149.93 → over the cap", () => {
      const r = computeFine(dobExample, "2030-2034");
      expect(r.emissionsLimitTco2e).toBeCloseTo(149.93, 2); // 44,800 × 0.00334664
      expect(r.compliant).toBe(false);
      // overage = 287.00 − 149.929472 = 137.070528 → fine = 137.070528 × 268 = $36,734.90
      expect(r.overageTco2e).toBeCloseTo(137.07, 2);
      expect(r.annualFineUsd).toBeCloseTo(36_734.9, 1);
    });

    it("2035-2039: limit drops further to 120.61 → still over", () => {
      const r = computeFine(dobExample, "2035-2039");
      expect(r.emissionsLimitTco2e).toBeCloseTo(120.61, 2); // 44,800 × 0.002692183
      expect(r.compliant).toBe(false);
    });

    it("rounds money to the cent via integer cents (no float drift)", () => {
      const r = computeFine(
        { grossFloorAreaSqft: 44_800, occupancyGroups: [{ group: "Multifamily Housing", sqft: 44_800 }], annualEmissionsTco2e: 400 },
        "2024-2029",
      );
      // overage = 400 − 302.40 = 97.60 → 97.60 × 268 = $26,156.80
      expect(r.overageTco2e).toBeCloseTo(97.6, 2);
      expect(r.annualFineUsd).toBe(26_156.8);
    });

    it("flags an unresolved use-type in notes and excludes it from the limit", () => {
      const r = computeFine(
        { grossFloorAreaSqft: 1000, occupancyGroups: [{ group: "Nuclear Reactor", sqft: 1000 }], annualEmissionsTco2e: 10 },
        "2024-2029",
      );
      expect(r.emissionsLimitTco2e).toBe(0);
      expect(r.notes.join(" ")).toMatch(/Nuclear Reactor/);
    });
  });

  describe("computeAllPeriods", () => {
    it("returns three results in period order", () => {
      const all = computeAllPeriods(dobExample);
      expect(all.map((r) => r.period)).toEqual(["2024-2029", "2030-2034", "2035-2039"]);
      // The cliff is visible across the array: compliant, then not, then not.
      expect(all.map((r) => r.compliant)).toEqual([true, false, false]);
    });
  });

  describe("Article 321 pathway", () => {
    it("reports the 2030 limit as target, no $ fine, with a caveat note", () => {
      const r = computeFine({ ...dobExample, isArticle321: true }, "2024-2029");
      expect(r.pathway).toBe("article321");
      expect(r.annualFineUsd).toBe(0);
      expect(r.overageTco2e).toBe(0);
      expect(r.compliant).toBe(true);
      expect(r.emissionsLimitTco2e).toBeCloseTo(149.93, 2); // 2030 target limit
      expect(r.notes.join(" ")).toMatch(/Article 321/);
    });
  });
  ```

- [ ] Run it — expect FAIL (no `computeFine` yet):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/engine.golden.test.ts
  ```
  Expected: FAIL — `computeFine is not a function` / not exported.

- [ ] Append to `lib/ll97/engine.ts` (after `factorFor`):
  ```ts
  import { PENALTY_RATE_CENTS_PER_TCO2E } from "./constants";

  function note(notes: string[], text: string): void {
    if (!notes.includes(text)) notes.push(text);
  }

  function roundTco2e(value: number): number {
    return Math.round(value * 100) / 100;
  }

  // Sum the per-group limit; a group whose label cannot resolve contributes 0 and
  // is flagged loudly in notes (never silently dropped).
  function limitFor(building: BuildingInput, period: Period, notes: string[]): number {
    let total = 0;
    for (const space of building.occupancyGroups) {
      const factor = factorFor(space.group, period);
      if (factor === undefined) {
        note(
          notes,
          `"${space.group}" is not in the rule's ESPM factor table; its ${space.sqft.toLocaleString(
            "en-US",
          )} sqft was excluded from the ${period} limit (estimate is conservative — true limit is no higher).`,
        );
        continue;
      }
      total += factor * space.sqft;
    }
    return total;
  }

  export function computeFine(building: BuildingInput, period: Period): FineResult {
    if (building.isArticle321) return computeArticle321Result(building, period);

    const notes: string[] = [];
    const limitTco2e = limitFor(building, period, notes);

    // Penalty per 1 RCNY §103-14(h): overage × $268. The rule specifies no rounding
    // convention, so math runs at full precision and rounds only here at the boundary —
    // tCO2e to two decimals (matching DOB's example), money to the cent via integer cents.
    const overageTco2e = Math.max(0, building.annualEmissionsTco2e - limitTco2e);
    const fineCents = Math.round(overageTco2e * PENALTY_RATE_CENTS_PER_TCO2E);

    note(
      notes,
      "Estimate only — the official LL97 compliance figure requires a registered design professional.",
    );

    return {
      period,
      emissionsLimitTco2e: roundTco2e(limitTco2e),
      actualEmissionsTco2e: building.annualEmissionsTco2e,
      overageTco2e: roundTco2e(overageTco2e),
      annualFineUsd: fineCents / 100,
      compliant: fineCents === 0,
      pathway: "standard",
      notes,
    };
  }

  // Article 321 buildings (rent-regulated / HDFC / project-based federal housing /
  // A-3 worship) are exempt from the $268/tCO2e penalty. They comply by prescribed
  // energy-conservation measures (Admin Code §28-321.2.2) or by meeting their 2030
  // limit early (§28-321.2.1). Non-compliance draws flat $10,000 penalties (a
  // different regime this engine does not model). We report the 2030 limit as target.
  function computeArticle321Result(building: BuildingInput, period: Period): FineResult {
    const notes: string[] = [];
    const targetLimitTco2e = limitFor(building, "2030-2034", notes);
    note(
      notes,
      "Article 321 building: complies via prescribed energy-conservation measures " +
        "(Admin Code §28-321.2.2) or by meeting its 2030 limit early (§28-321.2.1), " +
        "not the $268/tCO2e penalty. Limit shown is the 2030 target. Flat $10,000 " +
        "non-compliance penalties are not modeled.",
    );
    note(
      notes,
      "Article 321 eligibility is a user assertion — it cannot be proven from public data alone.",
    );
    return {
      period,
      emissionsLimitTco2e: roundTco2e(targetLimitTco2e),
      actualEmissionsTco2e: building.annualEmissionsTco2e,
      overageTco2e: 0,
      annualFineUsd: 0,
      compliant: true,
      pathway: "article321",
      notes,
    };
  }

  export function computeAllPeriods(building: BuildingInput): FineResult[] {
    return PERIODS.map((period) => computeFine(building, period));
  }
  ```
  Note: `PERIODS` is already re-exported at the top of the file; the `import { PENALTY_RATE_CENTS_PER_TCO2E }` line above can be merged into the existing top import — keep one import block.

- [ ] Run the golden test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/engine.golden.test.ts
  ```
  Expected: PASS (8 tests). The cliff assertions (compliant→over→over) confirm the headline demo number.

- [ ] Run the whole engine suite to confirm nothing regressed:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97
  ```
  Expected: PASS (constants + factorFor + golden).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/ll97/engine.ts test/ll97/engine.golden.test.ts
  git commit -m "feat(engine): computeFine/computeAllPeriods/Article321 + GOLDEN DOB worked example (the 2030 cliff)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4 — `recomputeEmissions` (`lib/ll97/emissions.ts`), DOB-basis from fuel columns

The contract's emissions recompute: from raw fuel use, apply the period-specific coefficients (electricity factor falls as the grid greens; gas/oil flat; steam falls slightly). Returns `{ tco2e, unpriceableFuels }`. Any fuel without a verified coefficient blocks the recompute (`tco2e: null`) and is listed — falling back beats pretending.

**Golden:** DOB worked example fuels — 310,000 kWh + 2,250,000 kBtu natural gas + 1,050,000 kBtu #2 fuel oil → **287.00 tCO2e** in 2024-2029 (286.99622, rounds to 287.00).

**Files**
- Create: `lib/ll97/emissions.ts`
- Test: `test/ll97/emissions.test.ts`

**Steps**

- [ ] Write the failing test `test/ll97/emissions.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { recomputeEmissions, type FuelUse } from "@/lib/ll97/emissions";

  // DOB worked example fuel mix.
  const dobFuel: FuelUse = {
    electricity_kWh: 310_000,
    naturalGas_kBtu: 2_250_000,
    fuelOil2_kBtu: 1_050_000,
  };

  describe("recomputeEmissions — DOB basis", () => {
    it("GOLDEN: DOB fuel mix → 287.00 tCO2e in 2024-2029", () => {
      const r = recomputeEmissions(dobFuel, "2024-2029");
      expect(r.tco2e).not.toBeNull();
      expect(r.tco2e as number).toBeCloseTo(287.0, 2);
      expect(r.unpriceableFuels).toEqual([]);
    });

    it("falls in 2030-2034 as the electricity coefficient halves", () => {
      const base = recomputeEmissions({ electricity_kWh: 310_000 }, "2024-2029").tco2e as number;
      const later = recomputeEmissions({ electricity_kWh: 310_000 }, "2030-2034").tco2e as number;
      expect(later).toBeLessThan(base);
      // 0.000145 vs 0.000288962 → roughly half
      expect(later).toBeCloseTo(310_000 * 0.000145, 3);
    });

    it("returns null tco2e and lists the fuel when an unpriceable fuel is present", () => {
      const r = recomputeEmissions({ fuelOil5or6_kBtu: 500_000 } as FuelUse, "2024-2029");
      expect(r.tco2e).toBeNull();
      expect(r.unpriceableFuels).toContain("fuelOil5or6_kBtu");
    });

    it("returns null tco2e when no priceable fuel is present at all", () => {
      const r = recomputeEmissions({}, "2024-2029");
      expect(r.tco2e).toBeNull();
      expect(r.unpriceableFuels).toEqual([]);
    });

    it("prices district steam with the period-specific coefficient", () => {
      const r = recomputeEmissions({ districtSteam_kBtu: 1_000_000 }, "2024-2029");
      expect(r.tco2e as number).toBeCloseTo(1_000_000 * 0.00004493, 3);
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/emissions.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/ll97/emissions'`.

- [ ] Create `lib/ll97/emissions.ts`:
  ```ts
  // Recompute building emissions (tCO2e) from raw fuel use, the DOB-penalty way.
  // ESPM's location-based GHG prices electricity with national eGRID factors; DOB's
  // penalty math uses the statute's coefficients. This recompute applies those.
  //
  // Coefficients (tCO2e per unit; electricity per kWh, fuels per kBtu):
  //   Source: NYC Admin Code §28-320.3.1.1 + DOB June 2024 guidance
  //   (docs/references/ll97_emissions.pdf) and 1 RCNY §103-14(d)(3)(i) — verified 2026-06-06.
  // The electricity coefficient falls across periods as the grid greens; gas/oil are
  // flat across the modeled periods; district steam falls slightly.

  import type { Period } from "./constants";

  export interface FuelUse {
    electricity_kWh?: number;
    naturalGas_kBtu?: number;
    fuelOil2_kBtu?: number;
    fuelOil4_kBtu?: number;
    districtSteam_kBtu?: number;
    // Present so unpriceable fuels can be detected and reported; never priced.
    fuelOil5or6_kBtu?: number;
    districtHotWater_kBtu?: number;
    districtChilledWater_kBtu?: number;
  }

  const FUEL_COEFFICIENTS: Record<
    Period,
    { electricity_kWh: number; naturalGas_kBtu: number; fuelOil2_kBtu: number; fuelOil4_kBtu: number; districtSteam_kBtu: number }
  > = {
    "2024-2029": { electricity_kWh: 0.000288962, naturalGas_kBtu: 0.00005311, fuelOil2_kBtu: 0.00007421, fuelOil4_kBtu: 0.00007529, districtSteam_kBtu: 0.00004493 },
    "2030-2034": { electricity_kWh: 0.000145, naturalGas_kBtu: 0.00005311, fuelOil2_kBtu: 0.00007421, fuelOil4_kBtu: 0.00007529, districtSteam_kBtu: 0.0000432 },
    "2035-2039": { electricity_kWh: 0.0000866886, naturalGas_kBtu: 0.00005311, fuelOil2_kBtu: 0.00007421, fuelOil4_kBtu: 0.00007529, districtSteam_kBtu: 0.000032 },
  };

  // Fuels the statute prices differently or not at all. Any positive consumption
  // here blocks the recompute (we return null and list the offending field).
  const UNPRICEABLE_FIELDS: Array<keyof FuelUse> = [
    "fuelOil5or6_kBtu",
    "districtHotWater_kBtu",
    "districtChilledWater_kBtu",
  ];

  export function recomputeEmissions(
    fuel: FuelUse,
    period: Period,
  ): { tco2e: number | null; unpriceableFuels: string[] } {
    const unpriceableFuels = UNPRICEABLE_FIELDS.filter((f) => (fuel[f] ?? 0) > 0).map(String);
    if (unpriceableFuels.length > 0) {
      return { tco2e: null, unpriceableFuels };
    }

    const c = FUEL_COEFFICIENTS[period];
    let total = 0;
    let pricedAnything = false;
    const add = (qty: number | undefined, coeff: number) => {
      if (qty != null && qty > 0) {
        total += qty * coeff;
        pricedAnything = true;
      }
    };
    add(fuel.electricity_kWh, c.electricity_kWh);
    add(fuel.naturalGas_kBtu, c.naturalGas_kBtu);
    add(fuel.fuelOil2_kBtu, c.fuelOil2_kBtu);
    add(fuel.fuelOil4_kBtu, c.fuelOil4_kBtu);
    add(fuel.districtSteam_kBtu, c.districtSteam_kBtu);

    if (!pricedAnything) return { tco2e: null, unpriceableFuels: [] };
    return { tco2e: Math.round(total * 100) / 100, unpriceableFuels: [] };
  }
  ```

- [ ] Run the test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/ll97/emissions.test.ts
  ```
  Expected: PASS (5 tests).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/ll97/emissions.ts test/ll97/emissions.test.ts
  git commit -m "feat(engine): recomputeEmissions (DOB basis) — golden 287.00 tCO2e + period-specific grid coefficient

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 5 — Data layer types + LL84 parser (`lib/data/types.ts`, `lib/data/ll84.ts`)

The locked data types, then the pure LL84 Socrata parser tested against the committed Empire State Building fixture (offline). Latest filing wins; `"Not Available" → null`; LL84 use-names map to ESPM vocabulary (renames vs. proxies vs. unmappable); emissions recomputed from fuel columns via Task 4's `recomputeEmissions`.

**Files**
- Create: `lib/data/types.ts`, `lib/data/http.ts`, `lib/data/ll84.ts`
- Create: `test/fixtures/ll84-1008350041.json`, `test/fixtures/ll84-no-filing.json`
- Test: `test/data/ll84.test.ts`

**Steps**

- [ ] Copy the committed LL84 fixtures (offline test inputs) into the repo's test tree:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  mkdir -p test/fixtures
  cp /tmp/aaravmin-fineprint/data/tests/fixtures/ll84-1008350041.json test/fixtures/ll84-1008350041.json
  cp /tmp/aaravmin-fineprint/data/tests/fixtures/ll84-no-filing.json test/fixtures/ll84-no-filing.json
  cp /tmp/aaravmin-fineprint/data/tests/fixtures/geosearch-350-5th-ave.json test/fixtures/geosearch-350-5th-ave.json
  cp /tmp/aaravmin-fineprint/data/tests/fixtures/geosearch-no-match.json test/fixtures/geosearch-no-match.json
  ```

- [ ] Create `lib/data/types.ts` (LOCKED contract — transcribe field-for-field):
  ```ts
  // Public types for the FinePrint data layer — the locked interface. Every fact
  // carries provenance: which dataset said it, so the UI renders an honest footnote.
  // Fields the city has no answer for are null, never guessed.

  export type Bbl = string; // 10-digit borough-block-lot

  export interface BblResult {
    bbl: Bbl;
    normalizedAddress: string;
    borough: string;
  }

  export interface UseSplit {
    group: string; // ESPM property-type name
    sqft: number;
  }

  export interface ProvenanceNote {
    field: string; // which BuildingFacts field this explains
    source: string; // dataset or API name
    detail?: string; // anything a footnote should add
  }

  export interface Ll84Facts {
    bbl: Bbl;
    reportedAddress: string | null;
    grossFloorAreaSqft: number | null;
    occupancyGroups: UseSplit[];
    annualEmissionsTco2e: number | null; // reported (eGRID basis)
    recomputedEmissionsTco2e: number | null; // DOB basis from fuel columns
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

  export interface CblEntry {
    bbl: Bbl;
    ll97: boolean;
    article321: boolean;
    sqft: number | null;
    address: string | null;
    source: string;
  }
  ```

- [ ] Create `lib/data/http.ts` (single fetch helper; used by the live-path Tasks 6 and the route):
  ```ts
  // One place for timeouts, JSON parsing, and errors that name which service failed.
  export interface FetchJsonOptions {
    service: string; // human name for error messages ("GeoSearch", "LL84")
    timeoutMs?: number;
  }

  export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
    const { service, timeoutMs = 10_000 } = options;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      throw new Error(`${service} request failed: ${(cause as Error).message}`, { cause });
    }
    if (!response.ok) {
      throw new Error(`${service} responded ${response.status} ${response.statusText} for ${url}`);
    }
    return (await response.json()) as T;
  }
  ```

- [ ] Write the failing test `test/data/ll84.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "node:fs";
  import { parseLl84Rows } from "@/lib/data/ll84";

  const esbRows = JSON.parse(
    readFileSync(new URL("../fixtures/ll84-1008350041.json", import.meta.url), "utf8"),
  );
  const noFilingRows = JSON.parse(
    readFileSync(new URL("../fixtures/ll84-no-filing.json", import.meta.url), "utf8"),
  );

  describe("parseLl84Rows — Empire State Building fixture (offline)", () => {
    const facts = parseLl84Rows(esbRows, "1008350041");

    it("returns null when there is no filing", () => {
      expect(parseLl84Rows(noFilingRows, "9999999999")).toBeNull();
    });

    it("picks gross floor area (calculated) and reporting year", () => {
      expect(facts?.grossFloorAreaSqft).toBe(2_852_257);
      expect(facts?.reportingYear).toBe(2024);
    });

    it("reads reported (eGRID) emissions verbatim", () => {
      expect(facts?.annualEmissionsTco2e).toBeCloseTo(16_678.22, 2);
    });

    it("recomputes DOB-basis emissions from the fuel columns (steam + gas + electricity)", () => {
      // district_steam 64,363,489.2 kBtu × 0.00004493 + natural_gas 5,469,879.2 × 0.00005311
      //   + electricity 30,849,800.6 kWh × 0.000288962 ≈ 12,090 tCO2e
      expect(facts?.recomputedEmissionsTco2e).not.toBeNull();
      expect(facts?.recomputedEmissionsTco2e as number).toBeGreaterThan(11_000);
      expect(facts?.recomputedEmissionsTco2e as number).toBeLessThan(13_000);
      expect(facts?.unpriceableFuels).toEqual([]);
    });

    it("maps the use list to ESPM vocabulary, renaming where needed", () => {
      const groups = Object.fromEntries((facts?.occupancyGroups ?? []).map((u) => [u.group, u.sqft]));
      // "Community Center and Social Meeting Hall" → "Social/Meeting Hall" (a rename)
      expect(groups["Social/Meeting Hall"]).toBeCloseTo(56_815, 0);
      expect(groups["Office"]).toBeCloseTo(2_692_475.1, 0);
      // The original LL84 name must NOT survive in occupancyGroups.
      expect(groups["Community Center and Social Meeting Hall"]).toBeUndefined();
    });

    it("never lets 'Not Available' become a number", () => {
      // fuel_oil_2 etc. are 'Not Available' in this fixture and must be ignored.
      expect(Number.isNaN(facts?.recomputedEmissionsTco2e as number)).toBe(false);
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/ll84.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/data/ll84'`.

- [ ] Create `lib/data/ll84.ts`:
  ```ts
  // BBL → building facts via the LL84 benchmarking dataset (Socrata 5zyy-y8am).
  // Pure parser (parseLl84Rows) is offline-testable; fetchLl84 wraps it with HTTP.

  import { fetchJson } from "./http";
  import { recomputeEmissions, type FuelUse } from "@/lib/ll97/emissions";
  import type { Bbl, Ll84Facts, UseSplit } from "./types";

  const LL84_URL = "https://data.cityofnewyork.us/resource/5zyy-y8am.json";

  // Exact renames: same ESPM type under a newer/longer LL84 name. Nothing to disclose.
  const LL84_USE_RENAMES: Record<string, string> = {
    "Community Center and Social Meeting Hall": "Social/Meeting Hall",
    "Senior Living Community": "Senior Care Community",
    "Vehicle Repair Services": "Repair Services (Vehicle, Shoe, Locksmith, etc.)",
    "Vehicle Dealership": "Automobile Dealership",
  };

  // Proxies: types the rule's table doesn't list. Mapped to the nearest bucket;
  // editorial judgment, surfaced in Ll84Facts.proxiedUses.
  const LL84_USE_PROXIES: Record<string, string> = {
    "Fire Station": "Other - Public Services",
    "Police Station": "Other - Public Services",
    "Prison/Incarceration": "Other - Public Services",
    "Wastewater Treatment Plant": "Other - Public Services",
    "Fast Food Restaurant": "Restaurant",
    "Bar/Nightclub": "Other - Restaurant/Bar",
    Zoo: "Other - Entertainment/Public Assembly",
    Aquarium: "Other - Entertainment/Public Assembly",
    "Convention Center": "Other - Entertainment/Public Assembly",
    "Stadium (Open)": "Other - Entertainment/Public Assembly",
    "Indoor Arena": "Other - Entertainment/Public Assembly",
    "Other - Stadium": "Other - Entertainment/Public Assembly",
    "Ice/Curling Rink": "Other - Recreation",
    "Heated Swimming Pool": "Other - Recreation",
    "Electric Vehicle Charging Station": "Parking",
    "Single-Family Home": "Other - Lodging/Residential",
    "Veterinary Office": "Other - Services",
  };

  // No defensible factor exists; excluded from engine input, surfaced in unmappedUses.
  const LL84_USE_UNMAPPABLE = new Set([
    "Other",
    "Not Available",
    "Other - Utility",
    "Energy/Power Station",
    "Drinking Water Treatment & Distribution",
  ]);

  // LL84 fuel columns → recomputeEmissions FuelUse fields. kBtu unless noted.
  const ELECTRICITY_KWH_COLUMN = "electricity_use_grid_purchase_1";

  interface Ll84Row {
    report_year?: string;
    property_name?: string;
    address_1?: string;
    property_gfa_calculated?: string;
    property_gfa_self_reported?: string;
    list_of_all_property_use?: string;
    total_location_based_ghg?: string;
    natural_gas_use_kbtu?: string;
    fuel_oil_2_use_kbtu?: string;
    fuel_oil_4_use_kbtu?: string;
    fuel_oil_5_6_use_kbtu?: string;
    district_steam_use_kbtu?: string;
    district_hot_water_use_kbtu?: string;
    district_chilled_water_use?: string;
    [k: string]: string | undefined;
  }

  export async function fetchLl84(bbl: Bbl): Promise<Ll84Facts | null> {
    const query = new URLSearchParams({
      nyc_borough_block_and_lot: bbl,
      $order: "report_year DESC",
      $limit: "10",
    });
    const token = globalThis.process?.env?.SOCRATA_APP_TOKEN;
    if (token) query.set("$$app_token", token);
    const rows = await fetchJson<Ll84Row[]>(`${LL84_URL}?${query}`, { service: "LL84" });
    return parseLl84Rows(rows, bbl);
  }

  export function parseLl84Rows(rows: Ll84Row[], bbl: Bbl): Ll84Facts | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Latest year wins; within a year, the largest-floor-area row is the whole lot.
    const latest = [...rows].sort(
      (a, b) =>
        (num(b.report_year) ?? 0) - (num(a.report_year) ?? 0) ||
        (floorArea(b) ?? 0) - (floorArea(a) ?? 0),
    )[0];

    const { mapped, proxied, unmapped } = mapUseList(latest.list_of_all_property_use);
    const fuel: FuelUse = {
      electricity_kWh: num(latest[ELECTRICITY_KWH_COLUMN]) ?? undefined,
      naturalGas_kBtu: num(latest.natural_gas_use_kbtu) ?? undefined,
      fuelOil2_kBtu: num(latest.fuel_oil_2_use_kbtu) ?? undefined,
      fuelOil4_kBtu: num(latest.fuel_oil_4_use_kbtu) ?? undefined,
      districtSteam_kBtu: num(latest.district_steam_use_kbtu) ?? undefined,
      fuelOil5or6_kBtu: num(latest.fuel_oil_5_6_use_kbtu) ?? undefined,
      districtHotWater_kBtu: num(latest.district_hot_water_use_kbtu) ?? undefined,
      districtChilledWater_kBtu: num(latest.district_chilled_water_use) ?? undefined,
    };
    const { tco2e, unpriceableFuels } = recomputeEmissions(fuel, "2024-2029");

    return {
      bbl,
      reportedAddress: latest.property_name ?? latest.address_1 ?? null,
      grossFloorAreaSqft: floorArea(latest),
      occupancyGroups: mapped,
      annualEmissionsTco2e: num(latest.total_location_based_ghg),
      recomputedEmissionsTco2e: tco2e,
      unpriceableFuels,
      reportingYear: num(latest.report_year),
      proxiedUses: proxied,
      unmappedUses: unmapped,
    };
  }

  function floorArea(row: Ll84Row): number | null {
    return num(row.property_gfa_calculated) ?? num(row.property_gfa_self_reported);
  }

  // The dataset writes "Not Available" instead of leaving fields empty. Anything
  // that isn't a clean finite number becomes null.
  function num(value: string | undefined): number | null {
    if (value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // list_of_all_property_use reads like "Office (2692475.1), Restaurant (50021.0)".
  // Names can contain commas/parens, so the only reliable delimiter is the trailing
  // "(<number>)" after each name.
  function mapUseList(useList: string | undefined): {
    mapped: UseSplit[];
    proxied: Array<{ from: string; to: string }>;
    unmapped: UseSplit[];
  } {
    const mapped: UseSplit[] = [];
    const proxied: Array<{ from: string; to: string }> = [];
    const unmapped: UseSplit[] = [];
    if (!useList) return { mapped, proxied, unmapped };

    const pattern = /(.+?)\s\((\d+(?:\.\d+)?)\)(?:,\s|$)/g;
    for (const [, name, sqftText] of useList.matchAll(pattern)) {
      const sqft = Number(sqftText);
      if (LL84_USE_UNMAPPABLE.has(name)) {
        unmapped.push({ group: name, sqft });
        continue;
      }
      const renamed = LL84_USE_RENAMES[name];
      if (renamed) {
        mapped.push({ group: renamed, sqft });
        continue;
      }
      const proxy = LL84_USE_PROXIES[name];
      if (proxy) {
        mapped.push({ group: proxy, sqft });
        proxied.push({ from: name, to: proxy });
        continue;
      }
      mapped.push({ group: name, sqft });
    }
    return { mapped, proxied, unmapped };
  }
  ```

- [ ] Run the test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/ll84.test.ts
  ```
  Expected: PASS (6 tests).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/data/types.ts lib/data/http.ts lib/data/ll84.ts test/data/ll84.test.ts test/fixtures
  git commit -m "feat(data): locked types + LL84 Socrata parser (latest-wins, NA→null, ESPM mapping) tested offline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 6 — GeoSearch resolver + Covered Buildings List loader (`lib/data/geosearch.ts`, `lib/data/coveredBuildings.ts`)

`geosearch.ts` parses the GeoSearch (Pelias) response into ranked BBL candidates (BBL at `properties.addendum.pad.bbl`). `coveredBuildings.ts` loads the gzipped CBL snapshot and answers LL97-coverage + Article-321 (CBL compliance pathway `3`). Both pure parsers are tested offline against the committed geosearch fixture and the real CBL snapshot.

**Files**
- Create: `lib/data/geosearch.ts`, `lib/data/coveredBuildings.ts`
- Test: `test/data/geosearch.test.ts`, `test/data/coveredBuildings.test.ts`

**Steps**

- [ ] Write the failing test `test/data/geosearch.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "node:fs";
  import { parseBblCandidates } from "@/lib/data/geosearch";

  const fifthAve = JSON.parse(
    readFileSync(new URL("../fixtures/geosearch-350-5th-ave.json", import.meta.url), "utf8"),
  );
  const noMatch = JSON.parse(
    readFileSync(new URL("../fixtures/geosearch-no-match.json", import.meta.url), "utf8"),
  );

  describe("parseBblCandidates", () => {
    it("returns ranked, de-duplicated BBL candidates", () => {
      const candidates = parseBblCandidates(fifthAve, "350 5th Ave");
      expect(candidates[0].bbl).toBe("1008350041");
      expect(candidates[0].borough).toBe("Manhattan");
      // 350 5 Ave also exists in Brooklyn — both boroughs must appear (same street, 2 lots).
      expect(candidates.some((c) => c.bbl === "3009810111")).toBe(true);
      // de-duped: no BBL appears twice.
      expect(new Set(candidates.map((c) => c.bbl)).size).toBe(candidates.length);
    });

    it("throws when no NYC address matched", () => {
      expect(() => parseBblCandidates(noMatch, "asdfqwer")).toThrow(/no NYC address/);
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/geosearch.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/data/geosearch'`.

- [ ] Create `lib/data/geosearch.ts`:
  ```ts
  // Address → BBL via NYC GeoSearch (Pelias). Free, no key.
  // https://geosearch.planninglabs.nyc/v2/search?text=<address>
  // BBL lives at properties.addendum.pad.bbl. Same street names exist in several
  // boroughs (350 5th Ave is Midtown AND Park Slope), so callers include the borough.

  import { fetchJson } from "./http";
  import type { BblResult } from "./types";

  const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";

  interface GeoSearchResponse {
    features: Array<{
      properties: {
        label?: string;
        borough?: string;
        addendum?: { pad?: { bbl?: string } };
      };
    }>;
  }

  // All ranked candidates, so the orchestrator can cross-check against the CBL —
  // GeoSearch's top pick is sometimes a different tax lot than DOF files under.
  export async function lookupBblCandidates(address: string): Promise<BblResult[]> {
    const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(address)}`;
    const response = await fetchJson<GeoSearchResponse>(url, { service: "GeoSearch" });
    return parseBblCandidates(response, address);
  }

  export function parseBblCandidates(response: GeoSearchResponse, queriedAddress: string): BblResult[] {
    const candidates: BblResult[] = [];
    const seen = new Set<string>();
    for (const feature of response.features ?? []) {
      const bbl = feature.properties.addendum?.pad?.bbl;
      if (!bbl || seen.has(bbl)) continue;
      seen.add(bbl);
      candidates.push({
        bbl,
        normalizedAddress: feature.properties.label ?? queriedAddress,
        borough: feature.properties.borough ?? "unknown",
      });
    }
    if (candidates.length === 0) {
      throw new Error(`no NYC address found for "${queriedAddress}"`);
    }
    return candidates;
  }
  ```

- [ ] Run the geosearch test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/geosearch.test.ts
  ```
  Expected: PASS (2 tests).

- [ ] Write the failing test `test/data/coveredBuildings.test.ts` (against the real committed snapshot):
  ```ts
  import { describe, it, expect } from "vitest";
  import { getCblEntry, isLl97Covered } from "@/lib/data/coveredBuildings";

  describe("Covered Buildings List loader (cbl26.json.gz)", () => {
    it("returns an entry for a known covered BBL", () => {
      const entry = getCblEntry("1000010010"); // 301 Comfort Road, from the snapshot
      expect(entry).not.toBeNull();
      expect(entry?.ll97).toBe(true);
      expect(entry?.sqft).toBe(2_542_066);
      expect(entry?.source).toMatch(/Covered Buildings List/);
    });

    it("article321 reflects CBL compliance pathway 3", () => {
      const entry = getCblEntry("1000010010");
      // pathway [0] in the snapshot → not Article 321.
      expect(entry?.article321).toBe(false);
    });

    it("returns null for a BBL absent from the list", () => {
      expect(getCblEntry("0000000000")).toBeNull();
    });

    it("isLl97Covered is false for an unknown BBL", () => {
      expect(isLl97Covered("0000000000")).toBe(false);
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/coveredBuildings.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/data/coveredBuildings'`.

- [ ] Create `lib/data/coveredBuildings.ts`:
  ```ts
  // LL97 applicability + the Article 321 flag, answered from DOB's Covered Buildings
  // List — the authoritative annual list, not a square-footage guess. A committed
  // gzipped snapshot (data/cbl/cbl26.json.gz, 29,173 covered BBLs) is the data; this
  // loader is remade. Node-only (reads from disk). Compliance pathway 3 = Article 321.

  import { readFileSync } from "node:fs";
  import { gunzipSync } from "node:zlib";
  import type { Bbl, CblEntry } from "./types";

  interface CblSnapshot {
    source: string;
    buildings: Record<
      string,
      { ll97: boolean; cp: number[]; ll84: boolean; ll87: boolean; ll88: boolean; gsf: number | null; addr: string | null }
    >;
  }

  const ARTICLE_321_PATHWAY = 3;
  let cached: CblSnapshot | null = null;

  function loadSnapshot(): CblSnapshot {
    if (!cached) {
      const gz = readFileSync(new URL("../../data/cbl/cbl26.json.gz", import.meta.url));
      cached = JSON.parse(gunzipSync(gz).toString("utf8")) as CblSnapshot;
    }
    return cached;
  }

  // Null means the BBL is absent from the list — not covered, or unknown to DOB.
  export function getCblEntry(bbl: Bbl): CblEntry | null {
    const snapshot = loadSnapshot();
    const raw = snapshot.buildings[bbl];
    if (!raw) return null;
    return {
      bbl,
      ll97: raw.ll97,
      article321: raw.cp.includes(ARTICLE_321_PATHWAY),
      sqft: raw.gsf,
      address: raw.addr,
      source: snapshot.source,
    };
  }

  export function isLl97Covered(bbl: Bbl): boolean {
    return getCblEntry(bbl)?.ll97 ?? false;
  }
  ```
  Note: the relative path `../../data/cbl/cbl26.json.gz` resolves from `lib/data/` to repo-root `data/cbl/`. Confirm with the test below.

- [ ] Run the coveredBuildings test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/coveredBuildings.test.ts
  ```
  Expected: PASS (4 tests). If the snapshot path fails to resolve, the first test will throw `ENOENT` — fix the relative URL, do not stub the file.

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/data/geosearch.ts lib/data/coveredBuildings.ts test/data/geosearch.test.ts test/data/coveredBuildings.test.ts
  git commit -m "feat(data): GeoSearch candidate parser + CBL snapshot loader (LL97 coverage + Article 321 pathway 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 7 — Lookup orchestrator (`lib/data/lookup.ts`) with DOF-aware BBL resolution + provenance

`lookupBuilding(address, sources?)` chains GeoSearch → LL84 → CBL into `BuildingFacts`, attaching a `provenance` note per field. The DOF-aware resolver picks the highest-ranked candidate the CBL knows — but only among candidates that share the queried house number, so "1 Pike Street" can never silently become "51 Pike Street." Sources are injectable so the orchestrator is fully testable offline.

**Files**
- Create: `lib/data/lookup.ts`
- Test: `test/data/lookup.test.ts`

**Steps**

- [ ] Write the failing test `test/data/lookup.test.ts` (pure, injected sources):
  ```ts
  import { describe, it, expect } from "vitest";
  import { lookupBuilding, type LookupSources } from "@/lib/data/lookup";
  import type { BblResult, CblEntry, Ll84Facts } from "@/lib/data/types";

  const candidate = (bbl: string, addr: string, borough = "Manhattan"): BblResult => ({
    bbl,
    normalizedAddress: addr,
    borough,
  });

  const ll84 = (over: Partial<Ll84Facts> = {}): Ll84Facts => ({
    bbl: "1008350041",
    reportedAddress: "Empire State Building",
    grossFloorAreaSqft: 2_852_257,
    occupancyGroups: [{ group: "Office", sqft: 2_692_475.1 }],
    annualEmissionsTco2e: 16_678.22,
    recomputedEmissionsTco2e: 12_090.0,
    unpriceableFuels: [],
    reportingYear: 2024,
    proxiedUses: [],
    unmappedUses: [],
    ...over,
  });

  const cbl = (over: Partial<CblEntry> = {}): CblEntry => ({
    bbl: "1008350041",
    ll97: true,
    article321: false,
    sqft: 2_852_257,
    address: "350 5 AVENUE",
    source: "DOB Covered Buildings List, Filing Year 2026",
    ...over,
  });

  describe("lookupBuilding", () => {
    it("assembles BuildingFacts and prefers the DOB-basis recomputed emissions", async () => {
      const sources: LookupSources = {
        lookupBblCandidates: async () => [candidate("1008350041", "350 5 AVENUE, New York")],
        fetchLl84: async () => ll84(),
        getCblEntry: () => cbl(),
      };
      const facts = await lookupBuilding("350 5th Ave, Manhattan", sources);
      expect(facts.bbl).toBe("1008350041");
      expect(facts.annualEmissionsTco2e).toBe(12_090.0); // recomputed wins over reported
      expect(facts.isLl97Covered).toBe(true);
      expect(facts.isArticle321).toBe(false);
      expect(facts.provenance.some((p) => p.field === "annualEmissionsTco2e")).toBe(true);
    });

    it("falls back to reported emissions when the recompute is blocked", async () => {
      const sources: LookupSources = {
        lookupBblCandidates: async () => [candidate("1008350041", "350 5 AVENUE")],
        fetchLl84: async () => ll84({ recomputedEmissionsTco2e: null, unpriceableFuels: ["fuelOil5or6_kBtu"] }),
        getCblEntry: () => cbl(),
      };
      const facts = await lookupBuilding("350 5th Ave", sources);
      expect(facts.annualEmissionsTco2e).toBe(16_678.22);
      expect(
        facts.provenance.find((p) => p.field === "annualEmissionsTco2e")?.detail,
      ).toMatch(/location-based/);
    });

    it("DOF-aware: among same-house-number candidates, prefers the one the CBL knows", async () => {
      const sources: LookupSources = {
        // top pick (BBL A) is unknown to DOF; second (BBL B) shares house number & is covered.
        lookupBblCandidates: async () => [
          candidate("1AAAAAAAAA", "1 Pike Street, New York"),
          candidate("1BBBBBBBBB", "1 Pike Street, New York"),
        ],
        fetchLl84: async () => null,
        getCblEntry: (bbl) => (bbl === "1BBBBBBBBB" ? cbl({ bbl: "1BBBBBBBBB" }) : null),
      };
      const facts = await lookupBuilding("1 Pike Street, Manhattan", sources);
      expect(facts.bbl).toBe("1BBBBBBBBB");
      expect(facts.provenance.find((p) => p.field === "bbl")?.detail).toMatch(/covered buildings list/i);
    });

    it("never crosses house numbers: '1 Pike' does not become '51 Pike' even if 51 is covered", async () => {
      const sources: LookupSources = {
        lookupBblCandidates: async () => [
          candidate("1AAAAAAAAA", "1 Pike Street, New York"),
          candidate("1CCCCCCCCC", "51 Pike Street, New York"),
        ],
        fetchLl84: async () => null,
        getCblEntry: (bbl) => (bbl === "1CCCCCCCCC" ? cbl({ bbl: "1CCCCCCCCC" }) : null),
      };
      const facts = await lookupBuilding("1 Pike Street, Manhattan", sources);
      expect(facts.bbl).toBe("1AAAAAAAAA"); // stays with the queried house number
    });

    it("degrades honestly when there is no LL84 filing", async () => {
      const sources: LookupSources = {
        lookupBblCandidates: async () => [candidate("1008350041", "350 5 AVENUE")],
        fetchLl84: async () => null,
        getCblEntry: () => cbl(),
      };
      const facts = await lookupBuilding("350 5th Ave", sources);
      expect(facts.annualEmissionsTco2e).toBeNull();
      expect(facts.occupancyGroups).toEqual([]);
      expect(facts.grossFloorAreaSqft).toBe(2_852_257); // falls back to DOF sqft
      expect(
        facts.provenance.find((p) => p.field === "annualEmissionsTco2e")?.detail,
      ).toMatch(/no LL84 filing/i);
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/lookup.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/data/lookup'`.

- [ ] Create `lib/data/lookup.ts`:
  ```ts
  // The orchestrator: one address in, everything FinePrint knows out.
  // GeoSearch → LL84 → Covered Buildings List, assembling BuildingFacts with a
  // provenance note per field; degrades honestly when a dataset is silent. Sources
  // are injectable so tests run fully offline.

  import { getCblEntry as realGetCblEntry } from "./coveredBuildings";
  import { lookupBblCandidates as realLookupBblCandidates } from "./geosearch";
  import { fetchLl84 as realFetchLl84 } from "./ll84";
  import type { Bbl, BblResult, BuildingFacts, CblEntry, Ll84Facts, ProvenanceNote } from "./types";

  export interface LookupSources {
    lookupBblCandidates: (address: string) => Promise<BblResult[]>;
    fetchLl84: (bbl: Bbl) => Promise<Ll84Facts | null>;
    getCblEntry: (bbl: Bbl) => CblEntry | null;
  }

  const realSources: LookupSources = {
    lookupBblCandidates: realLookupBblCandidates,
    fetchLl84: realFetchLl84,
    getCblEntry: realGetCblEntry,
  };

  export async function lookupBuilding(
    address: string,
    sources: LookupSources = realSources,
  ): Promise<BuildingFacts> {
    const provenance: ProvenanceNote[] = [];
    const geo = await resolveBbl(address, sources, provenance);
    const ll84 = await sources.fetchLl84(geo.bbl);
    const cbl = sources.getCblEntry(geo.bbl);

    const grossFloorAreaSqft = resolveFloorArea(ll84, cbl, provenance);
    const annualEmissionsTco2e = resolveEmissions(ll84, provenance);

    if (ll84) {
      for (const proxy of ll84.proxiedUses) {
        provenance.push({
          field: "occupancyGroups",
          source: "LL84 benchmarking disclosure",
          detail: `"${proxy.from}" is not in the rule's factor table; estimated as "${proxy.to}"`,
        });
      }
      if (ll84.unmappedUses.length > 0) {
        const excludedSqft = ll84.unmappedUses.reduce((s, u) => s + u.sqft, 0);
        const names = ll84.unmappedUses.map((u) => `"${u.group}"`).join(", ");
        provenance.push({
          field: "occupancyGroups",
          source: "LL84 benchmarking disclosure",
          detail: `${excludedSqft.toLocaleString("en-US")} sqft of ${names} has no defensible emissions factor and was excluded from the limit`,
        });
      }
    }

    const cblSource = cbl?.source ?? "DOB covered buildings list";
    provenance.push({
      field: "isLl97Covered",
      source: cblSource,
      detail: cbl ? "annual reference snapshot; DOB refreshes it each filing year" : "BBL absent from the covered buildings list",
    });
    provenance.push({ field: "isArticle321", source: cblSource });

    return {
      bbl: geo.bbl,
      address: geo.normalizedAddress,
      grossFloorAreaSqft,
      occupancyGroups: ll84?.occupancyGroups ?? [],
      annualEmissionsTco2e,
      isLl97Covered: cbl?.ll97 ?? false,
      isArticle321: cbl?.article321 ?? false,
      provenance,
    };
  }

  // GeoSearch's top pick is sometimes a different tax lot than DOF files under.
  // Prefer the highest-ranked candidate the CBL knows — but only among candidates
  // sharing the queried house number, so "1 Pike" can never become "51 Pike".
  async function resolveBbl(
    address: string,
    sources: LookupSources,
    provenance: ProvenanceNote[],
  ): Promise<BblResult> {
    const candidates = await sources.lookupBblCandidates(address);
    const queriedHouseNumber = houseNumber(address);
    const knownToDof = candidates.find(
      (c) => houseNumber(c.normalizedAddress) === queriedHouseNumber && sources.getCblEntry(c.bbl) !== null,
    );
    const chosen = knownToDof ?? candidates[0];

    if (knownToDof && knownToDof !== candidates[0]) {
      provenance.push({
        field: "bbl",
        source: "NYC GeoSearch",
        detail: `top match (BBL ${candidates[0].bbl}) is unknown to DOF; used "${chosen.normalizedAddress}" (BBL ${chosen.bbl}) from the covered buildings list instead`,
      });
    } else {
      provenance.push({ field: "bbl", source: "NYC GeoSearch" });
    }
    return chosen;
  }

  // Leading house number, hyphenated Queens style included ("58-01" stays "58-01").
  function houseNumber(address: string): string {
    return address.trim().match(/^(\d+(?:-\d+)?)/)?.[1] ?? "";
  }

  // DOB's penalty math uses the statute-coefficient recompute; ESPM's location-based
  // GHG is the fallback when a fuel can't be priced.
  function resolveEmissions(ll84: Ll84Facts | null, provenance: ProvenanceNote[]): number | null {
    if (!ll84) {
      provenance.push({
        field: "annualEmissionsTco2e",
        source: "LL84 benchmarking disclosure",
        detail: "no LL84 filing found — emissions and use splits unavailable",
      });
      return null;
    }
    const filingYear = ll84.reportingYear ?? "unknown";
    if (ll84.recomputedEmissionsTco2e !== null) {
      provenance.push({
        field: "annualEmissionsTco2e",
        source: "LL84 benchmarking disclosure",
        detail: `${filingYear} filing, recomputed from fuel use with Admin Code §28-320.3.1.1 coefficients`,
      });
      return ll84.recomputedEmissionsTco2e;
    }
    const blockedBy = ll84.unpriceableFuels.length > 0 ? ` (${ll84.unpriceableFuels.join(", ")} has no verified coefficient)` : "";
    provenance.push({
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: `${filingYear} filing, location-based GHG as reported${blockedBy}`,
    });
    return ll84.annualEmissionsTco2e;
  }

  function resolveFloorArea(ll84: Ll84Facts | null, cbl: CblEntry | null, provenance: ProvenanceNote[]): number | null {
    if (ll84?.grossFloorAreaSqft != null) {
      provenance.push({ field: "grossFloorAreaSqft", source: "LL84 benchmarking disclosure", detail: `${ll84.reportingYear ?? "unknown"} filing` });
      return ll84.grossFloorAreaSqft;
    }
    if (cbl?.sqft != null) {
      provenance.push({ field: "grossFloorAreaSqft", source: cbl.source, detail: "no LL84 filing — using DOF tax-lot square footage" });
      return cbl.sqft;
    }
    provenance.push({ field: "grossFloorAreaSqft", source: "none", detail: "no LL84 filing and no DOF record — floor area unknown" });
    return null;
  }
  ```

- [ ] Run the lookup test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/lookup.test.ts
  ```
  Expected: PASS (6 tests).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/data/lookup.ts test/data/lookup.test.ts
  git commit -m "feat(data): lookupBuilding orchestrator — DOF-aware BBL resolution + per-field provenance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8 — SQLite cache (`lib/data/cache.ts`) + `scripts/fetch-ll84.ts` + 3 committed demo fixtures

The cache makes the demo venue-wifi-proof: read building facts from a local SQLite file first; only hit live Socrata on a miss. `scripts/fetch-ll84.ts` warms the cache for the 3 demo buildings (incl. one affordable) and writes their `BuildingFacts` JSON to `test/fixtures/demo/` so the demo path runs even with the SQLite file deleted. A unit test covers round-trip read/write against a temp DB.

**Demo buildings (from the seed list; one affordable):**
1. `1 Centre Street, Manhattan` (large municipal office).
2. `350 5th Avenue, Manhattan` (Empire State Building — mixed-use; our golden fixture BBL `1008350041`).
3. `880 Boynton Avenue, Bronx` (affordable / Article 321 candidate).

**Files**
- Create: `lib/data/cache.ts`, `scripts/fetch-ll84.ts`
- Create (generated, then committed): `test/fixtures/demo/{1-centre-street,350-5th-avenue,880-boynton-avenue}.json`
- Test: `test/data/cache.test.ts`

**Steps**

- [ ] Write the failing test `test/data/cache.test.ts`:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { rmSync } from "node:fs";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { openCache, readFacts, writeFacts } from "@/lib/data/cache";
  import type { BuildingFacts } from "@/lib/data/types";

  const dbPath = join(tmpdir(), `fineprint-cache-test-${process.pid}.sqlite`);

  const sample: BuildingFacts = {
    bbl: "1008350041",
    address: "350 5 AVENUE, New York",
    grossFloorAreaSqft: 2_852_257,
    occupancyGroups: [{ group: "Office", sqft: 2_692_475.1 }],
    annualEmissionsTco2e: 12_090.0,
    isLl97Covered: true,
    isArticle321: false,
    provenance: [{ field: "bbl", source: "NYC GeoSearch" }],
  };

  afterEach(() => {
    try {
      rmSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  describe("SQLite building-facts cache", () => {
    it("round-trips BuildingFacts by BBL", () => {
      const db = openCache(dbPath);
      writeFacts(db, sample);
      const got = readFacts(db, "1008350041");
      expect(got).toEqual(sample);
      db.close();
    });

    it("returns null on a cache miss", () => {
      const db = openCache(dbPath);
      expect(readFacts(db, "9999999999")).toBeNull();
      db.close();
    });

    it("upserts (latest write wins) on the same BBL", () => {
      const db = openCache(dbPath);
      writeFacts(db, sample);
      writeFacts(db, { ...sample, annualEmissionsTco2e: 1.0 });
      expect(readFacts(db, "1008350041")?.annualEmissionsTco2e).toBe(1.0);
      db.close();
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/cache.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/data/cache'`.

- [ ] Create `lib/data/cache.ts`:
  ```ts
  // Local SQLite cache of BuildingFacts so the demo runs offline (venue-wifi-proof).
  // Read here first; only hit live Socrata on a miss (the route does that fallback).
  // Node-only — never imported by client components.

  import Database from "better-sqlite3";
  import type { BuildingFacts } from "./types";

  export type CacheDb = Database.Database;

  // Default on-disk cache; scripts/fetch-ll84.ts writes it. Kept out of git.
  export const DEFAULT_CACHE_PATH = new URL("../../data/cache/ll84.sqlite", import.meta.url).pathname;

  export function openCache(path: string = DEFAULT_CACHE_PATH): CacheDb {
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.exec(
      `CREATE TABLE IF NOT EXISTS building_facts (
         bbl TEXT PRIMARY KEY,
         json TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    );
    return db;
  }

  export function writeFacts(db: CacheDb, facts: BuildingFacts): void {
    db.prepare(
      `INSERT INTO building_facts (bbl, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(bbl) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    ).run(facts.bbl, JSON.stringify(facts), Date.now());
  }

  export function readFacts(db: CacheDb, bbl: string): BuildingFacts | null {
    const row = db.prepare(`SELECT json FROM building_facts WHERE bbl = ?`).get(bbl) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as BuildingFacts) : null;
  }
  ```

- [ ] Run the cache test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run test/data/cache.test.ts
  ```
  Expected: PASS (3 tests).

- [ ] Create `scripts/fetch-ll84.ts` (warms the SQLite cache + writes committed demo fixtures):
  ```ts
  // One-time cache warmer. Resolves the 3 demo addresses through the live pipeline,
  // writes BuildingFacts into the SQLite cache, AND dumps each as a committed JSON
  // fixture so the demo runs even if the SQLite file is absent. Run: npm run fetch-ll84.

  import { mkdirSync, writeFileSync } from "node:fs";
  import { dirname } from "node:path";
  import { fileURLToPath } from "node:url";
  import { lookupBuilding } from "@/lib/data/lookup";
  import { openCache, writeFacts, DEFAULT_CACHE_PATH } from "@/lib/data/cache";

  const DEMO_BUILDINGS: Array<{ slug: string; address: string }> = [
    { slug: "1-centre-street", address: "1 Centre Street, Manhattan" },
    { slug: "350-5th-avenue", address: "350 5th Avenue, Manhattan" },
    { slug: "880-boynton-avenue", address: "880 Boynton Avenue, Bronx" },
  ];

  async function main() {
    mkdirSync(dirname(DEFAULT_CACHE_PATH), { recursive: true });
    const db = openCache(DEFAULT_CACHE_PATH);
    const fixtureDir = fileURLToPath(new URL("../test/fixtures/demo/", import.meta.url));
    mkdirSync(fixtureDir, { recursive: true });

    for (const { slug, address } of DEMO_BUILDINGS) {
      try {
        const facts = await lookupBuilding(address);
        writeFacts(db, facts);
        writeFileSync(`${fixtureDir}${slug}.json`, JSON.stringify(facts, null, 2));
        console.log(`cached ${address} → BBL ${facts.bbl}`);
      } catch (err) {
        console.error(`FAILED ${address}: ${(err as Error).message}`);
      }
    }
    db.close();
    console.log(`done. cache: ${DEFAULT_CACHE_PATH}`);
  }

  main();
  ```

- [ ] Add `data/cache/` to `.gitignore` (the SQLite file is generated, not committed; the demo fixtures ARE committed):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  printf '\ndata/cache/\n' >> .gitignore
  ```

- [ ] Warm the cache and generate the committed demo fixtures (needs network once):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npm run fetch-ll84
  ```
  Expected: three `cached ... → BBL ...` lines and three files under `test/fixtures/demo/`. If a building has no LL84 filing, its fixture still writes (`annualEmissionsTco2e: null` + provenance) — that is honest and acceptable. If the network is unavailable at build time, hand-create the three fixtures from the BBLs in the CBL snapshot so the demo path still has data; do not skip this step.

- [ ] Commit (cache code, script, committed demo fixtures):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add lib/data/cache.ts scripts/fetch-ll84.ts test/data/cache.test.ts test/fixtures/demo .gitignore
  git commit -m "feat(data): SQLite facts cache + fetch-ll84 warmer + 3 committed demo fixtures (offline demo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 9 — API route `POST /api/building` (cache-first, live fallback) + route test

The single P0 route. Accepts `{ address }` or `{ bbl }`, resolves `BuildingFacts` (SQLite cache first, then live `lookupBuilding`), computes `FineResult[]` via `computeAllPeriods`, and returns `{ facts, fines }`. Article 321 is honored when the CBL flags it (`isArticle321`). Returns web-standard `Response.json(...)` per Next 16. The route test injects facts and asserts the contract shape and the 2030 cliff.

**Files**
- Create: `app/api/building/route.ts`
- Test: `app/api/building/route.test.ts`

**Steps**

- [ ] Write the failing route test `app/api/building/route.test.ts` (tests the pure assembly helper so it needs no live network):
  ```ts
  import { describe, it, expect } from "vitest";
  import { assembleResponse } from "@/app/api/building/route";
  import type { BuildingFacts } from "@/lib/data/types";

  // A 44,800 sf Multifamily building (DOB golden) over the 2030 cliff.
  const facts: BuildingFacts = {
    bbl: "2030303030",
    address: "880 Boynton Avenue, Bronx",
    grossFloorAreaSqft: 44_800,
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 44_800 }],
    annualEmissionsTco2e: 287.0,
    isLl97Covered: true,
    isArticle321: false,
    provenance: [{ field: "bbl", source: "NYC GeoSearch" }],
  };

  describe("assembleResponse", () => {
    it("returns facts + three FineResults showing the 2030 cliff", () => {
      const { facts: f, fines } = assembleResponse(facts);
      expect(f.bbl).toBe("2030303030");
      expect(fines.map((r) => r.period)).toEqual(["2024-2029", "2030-2034", "2035-2039"]);
      expect(fines[0].compliant).toBe(true); // 287 < 302.40
      expect(fines[1].compliant).toBe(false); // 287 > 149.93 → the cliff
      expect(fines[1].annualFineUsd).toBeGreaterThan(0);
    });

    it("routes Article-321 facts through the no-fine pathway", () => {
      const { fines } = assembleResponse({ ...facts, isArticle321: true });
      expect(fines.every((r) => r.pathway === "article321")).toBe(true);
      expect(fines.every((r) => r.annualFineUsd === 0)).toBe(true);
    });

    it("handles missing emissions/GFA without throwing (emits empty fines)", () => {
      const { fines } = assembleResponse({
        ...facts,
        grossFloorAreaSqft: null,
        occupancyGroups: [],
        annualEmissionsTco2e: null,
      });
      expect(fines).toEqual([]);
    });
  });
  ```

- [ ] Run it — expect FAIL:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run app/api/building/route.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/app/api/building/route'`.

- [ ] Create `app/api/building/route.ts`:
  ```ts
  // POST /api/building  { address?: string; bbl?: string }
  //   -> { facts: BuildingFacts; fines: FineResult[] }
  // Cache-first (SQLite), live fallback (lookupBuilding). Numbers come only from
  // computeAllPeriods — this route never does arithmetic itself.

  import { lookupBuilding } from "@/lib/data/lookup";
  import { openCache, readFacts, writeFacts, DEFAULT_CACHE_PATH } from "@/lib/data/cache";
  import { getCblEntry } from "@/lib/data/coveredBuildings";
  import { computeAllPeriods, type BuildingInput, type FineResult } from "@/lib/ll97/engine";
  import type { BuildingFacts } from "@/lib/data/types";
  import { existsSync } from "node:fs";

  // Pure: facts → { facts, fines }. Exported for unit tests. When emissions or use
  // splits are unknown, return empty fines (no fabricated numbers).
  export function assembleResponse(facts: BuildingFacts): { facts: BuildingFacts; fines: FineResult[] } {
    if (facts.annualEmissionsTco2e == null || facts.occupancyGroups.length === 0 || facts.grossFloorAreaSqft == null) {
      return { facts, fines: [] };
    }
    const input: BuildingInput = {
      grossFloorAreaSqft: facts.grossFloorAreaSqft,
      occupancyGroups: facts.occupancyGroups,
      annualEmissionsTco2e: facts.annualEmissionsTco2e,
      isArticle321: facts.isArticle321 ?? false,
    };
    return { facts, fines: computeAllPeriods(input) };
  }

  // Cache-first resolve by BBL; live fallback warms the cache for next time.
  function resolveByBbl(bbl: string): BuildingFacts | null {
    if (existsSync(DEFAULT_CACHE_PATH)) {
      const db = openCache(DEFAULT_CACHE_PATH);
      const hit = readFacts(db, bbl);
      db.close();
      if (hit) return hit;
    }
    const cbl = getCblEntry(bbl);
    if (!cbl) return null;
    return {
      bbl,
      address: cbl.address ?? bbl,
      grossFloorAreaSqft: cbl.sqft,
      occupancyGroups: [],
      annualEmissionsTco2e: null,
      isLl97Covered: cbl.ll97,
      isArticle321: cbl.article321,
      provenance: [{ field: "isLl97Covered", source: cbl.source }],
    };
  }

  async function resolveByAddress(address: string): Promise<BuildingFacts> {
    const facts = await lookupBuilding(address);
    if (existsSync(DEFAULT_CACHE_PATH)) {
      const db = openCache(DEFAULT_CACHE_PATH);
      writeFacts(db, facts);
      db.close();
    }
    return facts;
  }

  export async function POST(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid request body" }, { status: 400 });
    }
    const b = body as { address?: unknown; bbl?: unknown } | null;
    const bbl = typeof b?.bbl === "string" ? b.bbl.trim() : "";
    const address = typeof b?.address === "string" ? b.address.trim() : "";

    if (!bbl && !address) {
      return Response.json({ error: "address or bbl required" }, { status: 400 });
    }
    if (address && address.length > 200) {
      return Response.json({ error: "invalid address" }, { status: 400 });
    }

    try {
      if (bbl) {
        const facts = resolveByBbl(bbl);
        if (!facts) return Response.json({ error: "BBL not found", fallbackNeeded: true }, { status: 404 });
        return Response.json(assembleResponse(facts));
      }
      const facts = await resolveByAddress(address);
      return Response.json(assembleResponse(facts));
    } catch (err) {
      return Response.json(
        { error: `lookup failed: ${(err as Error).message}`, fallbackNeeded: true },
        { status: 502 },
      );
    }
  }
  ```

- [ ] Run the route test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run app/api/building/route.test.ts
  ```
  Expected: PASS (3 tests).

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add app/api/building/route.ts app/api/building/route.test.ts
  git commit -m "feat(api): POST /api/building — cache-first facts + computeAllPeriods (Response.json, Next 16)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 10 — UI: SearchBar, CliffChart, ProvenanceFootnote, ResultCard, page

The result card. `CliffChart` is the centerpiece: a Recharts bar chart with one emissions bar per period and two limit reference lines (CP1 = 2024-2029, CP2 = 2030-2034); the 2030 figure renders in red when over the cap. `ProvenanceFootnote` renders every `FineResult.notes` string and `BuildingFacts.provenance` note verbatim. `ResultCard` shows the headline verdict + per-period numbers; `SearchBar` posts to `/api/building`; `app/page.tsx` wires it together. UI is verified by `npm run build` + screenshots, plus one render smoke test for `CliffChart`.

**Files**
- Create: `components/SearchBar.tsx`, `components/CliffChart.tsx`, `components/ProvenanceFootnote.tsx`, `components/ResultCard.tsx`
- Create: `app/page.tsx`
- Test: `components/CliffChart.test.tsx` (jsdom smoke render)

**Steps**

- [ ] Create `components/ProvenanceFootnote.tsx` (renders notes + provenance verbatim — the trust layer):
  ```tsx
  import type { BuildingFacts } from "@/lib/data/types";
  import type { FineResult } from "@/lib/ll97/engine";

  export function ProvenanceFootnote({ facts, fines }: { facts: BuildingFacts; fines: FineResult[] }) {
    // De-dupe notes across periods; render every distinct caveat verbatim.
    const notes = Array.from(new Set(fines.flatMap((f) => f.notes)));
    return (
      <section className="mt-8 border-t border-hairline pt-4 text-sm text-muted">
        <h3 className="font-medium text-foreground">How we know this</h3>
        <ul className="mt-2 space-y-1">
          {facts.provenance.map((p, i) => (
            <li key={`prov-${i}`}>
              <span className="font-medium text-foreground">{p.field}</span>: {p.source}
              {p.detail ? ` — ${p.detail}` : ""}
            </li>
          ))}
        </ul>
        {notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {notes.map((n, i) => (
              <li key={`note-${i}`}>• {n}</li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  ```

- [ ] Create `components/CliffChart.tsx` (Recharts bars per period + two limit reference lines; client component):
  ```tsx
  "use client";

  import {
    Bar,
    BarChart,
    Cell,
    CartesianGrid,
    LabelList,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } from "recharts";
  import type { FineResult } from "@/lib/ll97/engine";

  const OVER = "#c0341d";
  const UNDER = "#1f7a4d";

  export function CliffChart({ fines }: { fines: FineResult[] }) {
    if (fines.length === 0) return null;
    const data = fines.map((f) => ({
      period: f.period,
      emissions: f.actualEmissionsTco2e,
      limit: f.emissionsLimitTco2e,
      over: !f.compliant,
    }));
    const cp1Limit = fines[0].emissionsLimitTco2e;
    const cp2Limit = fines[1]?.emissionsLimitTco2e ?? cp1Limit;

    return (
      <div className="fp-rise h-72 w-full" aria-label="Emissions versus limit, by compliance period">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e3" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={48} />
            <Tooltip
              formatter={(v: number) => [`${v.toLocaleString("en-US")} tCO₂e`, ""]}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <ReferenceLine y={cp1Limit} stroke={UNDER} strokeDasharray="4 4" label={{ value: "2024 limit", fontSize: 11, fill: UNDER, position: "insideTopRight" }} />
            <ReferenceLine y={cp2Limit} stroke={OVER} strokeDasharray="4 4" label={{ value: "2030 limit", fontSize: 11, fill: OVER, position: "insideBottomRight" }} />
            <Bar dataKey="emissions" radius={[4, 4, 0, 0]} isAnimationActive>
              {data.map((d, i) => (
                <Cell key={i} fill={d.over ? OVER : UNDER} />
              ))}
              <LabelList dataKey="emissions" position="top" formatter={(v: number) => Math.round(v).toLocaleString("en-US")} style={{ fontSize: 11 }} className="tabular-nums" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```

- [ ] Create `components/ResultCard.tsx` (headline verdict + per-period numbers + chart + footnote):
  ```tsx
  import type { BuildingFacts } from "@/lib/data/types";
  import type { FineResult } from "@/lib/ll97/engine";
  import { CliffChart } from "./CliffChart";
  import { ProvenanceFootnote } from "./ProvenanceFootnote";

  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  export function ResultCard({ facts, fines }: { facts: BuildingFacts; fines: FineResult[] }) {
    const cliff = fines.find((f) => f.period === "2030-2034");
    const headline = cliff && !cliff.compliant ? cliff.annualFineUsd : 0;
    const isArticle321 = fines[0]?.pathway === "article321";

    return (
      <article className="fp-pop mx-auto w-full max-w-2xl rounded-2xl border border-hairline bg-white/60 p-6 shadow-sm">
        <p className="text-sm text-muted">{facts.address}</p>
        {fines.length === 0 ? (
          <p className="mt-2 text-lg">Not enough public data to compute a fine for this building yet.</p>
        ) : isArticle321 ? (
          <p className="mt-1 text-2xl font-semibold">Article 321 pathway — no $ penalty; 2030 target shown below.</p>
        ) : (
          <p className="mt-1 text-4xl font-semibold tabular-nums" style={{ color: headline > 0 ? "var(--over)" : "var(--under)" }}>
            {headline > 0 ? `${usd(headline)}/yr at the 2030 cliff` : "Compliant through 2030"}
          </p>
        )}

        {fines.length > 0 && (
          <>
            <div className="mt-6">
              <CliffChart fines={fines} />
            </div>
            <table className="mt-6 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1">Period</th>
                  <th>Emissions</th>
                  <th>Limit</th>
                  <th>Annual fine</th>
                </tr>
              </thead>
              <tbody>
                {fines.map((f) => (
                  <tr key={f.period} className="border-t border-hairline">
                    <td className="py-1">{f.period}</td>
                    <td>{f.actualEmissionsTco2e.toLocaleString("en-US")} tCO₂e</td>
                    <td>{f.emissionsLimitTco2e.toLocaleString("en-US")} tCO₂e</td>
                    <td style={{ color: f.compliant ? "var(--under)" : "var(--over)" }}>
                      {f.compliant ? "$0" : usd(f.annualFineUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ProvenanceFootnote facts={facts} fines={fines} />
          </>
        )}
      </article>
    );
  }
  ```

- [ ] Create `components/SearchBar.tsx` (client; posts to `/api/building`):
  ```tsx
  "use client";

  import { useState } from "react";
  import type { BuildingFacts } from "@/lib/data/types";
  import type { FineResult } from "@/lib/ll97/engine";

  export interface BuildingResponse {
    facts: BuildingFacts;
    fines: FineResult[];
  }

  export function SearchBar({ onResult }: { onResult: (r: BuildingResponse) => void }) {
    const [address, setAddress] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      if (!address.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/building", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "lookup failed");
          return;
        }
        onResult(data as BuildingResponse);
      } catch {
        setError("network error — try again");
      } finally {
        setLoading(false);
      }
    }

    return (
      <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter a NYC address (include the borough)"
          className="flex-1 rounded-xl border border-hairline bg-white px-4 py-3 text-base outline-none focus:border-foreground"
          aria-label="NYC building address"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-foreground px-5 py-3 text-base font-medium text-background transition active:scale-[0.97] disabled:opacity-50"
        >
          {loading ? "Looking…" : "See the fine"}
        </button>
        {error && <p className="mt-2 text-sm text-over">{error}</p>}
      </form>
    );
  }
  ```

- [ ] Create `app/page.tsx` (client page wiring search → result card):
  ```tsx
  "use client";

  import { useState } from "react";
  import { SearchBar, type BuildingResponse } from "@/components/SearchBar";
  import { ResultCard } from "@/components/ResultCard";

  export default function Home() {
    const [result, setResult] = useState<BuildingResponse | null>(null);

    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">FinePrint</h1>
          <p className="mt-2 text-muted">
            Your building&apos;s real Local Law 97 carbon fine — and the 2030 cliff.
          </p>
        </header>
        <SearchBar onResult={setResult} />
        {result && <ResultCard facts={result.facts} fines={result.fines} />}
        <p className="mt-auto text-center text-xs text-muted">
          Every figure is a labeled estimate. The official compliance number requires a registered design professional.
        </p>
      </main>
    );
  }
  ```

- [ ] Write the CliffChart smoke test `components/CliffChart.test.tsx`:
  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect } from "vitest";
  import { render } from "@testing-library/react";
  import { CliffChart } from "./CliffChart";
  import type { FineResult } from "@/lib/ll97/engine";

  const fines: FineResult[] = [
    { period: "2024-2029", emissionsLimitTco2e: 302.4, actualEmissionsTco2e: 287, overageTco2e: 0, annualFineUsd: 0, compliant: true, pathway: "standard", notes: [] },
    { period: "2030-2034", emissionsLimitTco2e: 149.93, actualEmissionsTco2e: 287, overageTco2e: 137.07, annualFineUsd: 36734.9, compliant: false, pathway: "standard", notes: [] },
    { period: "2035-2039", emissionsLimitTco2e: 120.61, actualEmissionsTco2e: 287, overageTco2e: 166.39, annualFineUsd: 44592.52, compliant: false, pathway: "standard", notes: [] },
  ];

  describe("CliffChart", () => {
    it("renders an accessible chart region for the periods", () => {
      const { container } = render(<CliffChart fines={fines} />);
      expect(container.querySelector('[aria-label*="compliance period"]')).not.toBeNull();
    });

    it("renders nothing when there are no fines", () => {
      const { container } = render(<CliffChart fines={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });
  ```

- [ ] Run the component test — expect PASS:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx vitest run components/CliffChart.test.tsx
  ```
  Expected: PASS (2 tests). (Recharts `ResponsiveContainer` renders with zero size in jsdom; the smoke test asserts the wrapper region exists, not pixel layout.)

- [ ] Commit:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add components app/page.tsx components/CliffChart.test.tsx
  git commit -m "feat(ui): SearchBar + ResultCard + CliffChart (2030 cliff, red-when-over) + ProvenanceFootnote

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 11 — Full verification: tsc, full test suite, build, and a demo screenshot

Final gate. Type-check, run the complete Vitest suite green, build the Next app, and capture a screenshot of the rendered result card to confirm the 2030 cliff is visible (color + number going red). This task adds no production code; it verifies the whole P0 surface.

**Files**
- None (verification only).

**Steps**

- [ ] Type-check the whole repo (excluding `reference/`):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npx tsc --noEmit
  ```
  Expected: exit 0, no output. Fix any type error before proceeding (do not `// @ts-ignore`).

- [ ] Run the full test suite:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npm test
  ```
  Expected: all suites pass — `constants`, `factorFor`, `engine.golden`, `emissions`, `ll84`, `geosearch`, `coveredBuildings`, `lookup`, `cache`, `route`, `CliffChart`. Zero failures.

- [ ] Build the production app:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city && npm run build
  ```
  Expected: build succeeds; `/api/building` is listed as a route and `/` as a static/client page. (If `better-sqlite3` trips the bundler, confirm `serverExternalPackages` in `next.config.ts` from Task 0.)

- [ ] Serve the build and screenshot the result card to verify the 2030 cliff is unmissable:
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  pkill -f "next start" || true
  npm start &
  # wait for :3000 to answer, then drive headless Chromium and read the PNG:
  until curl -sf http://localhost:3000 >/dev/null; do :; done
  node /tmp/shots/shot.mjs "http://localhost:3000" /tmp/shots/p0
  ```
  Then Read the captured PNG. Confirm: the search bar renders, and after a demo lookup the headline fine + the CliffChart show the 2030 bar in red above the 2030 limit line. If the screenshot is an old/unstyled build, you forgot `pkill -f "next start"` first — kill it and retry (this exact mistake once masked a whole redesign). Stop the server when done:
  ```bash
  pkill -f "next start" || true
  ```

- [ ] Commit any final fixes made during verification (if none, skip):
  ```bash
  cd /Users/aayanalwani/fineprint-manifesting-the-city
  git add -A
  git commit -m "chore(p0): verification pass — tsc clean, full suite green, build + cliff screenshot confirmed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Pause for number review** (per spec §7): P0 ends here. Report the golden numbers to the user — the DOB worked example (44,800 sf Multifamily): 2024-2029 compliant ($0, limit 302.40), 2030-2034 over the cliff (limit 149.93, fine ≈$36,734.90/yr), 2035-2039 over (limit 120.61). Do not begin P1 until the numbers are confirmed.

---

## Self-check — P0 spec coverage

Every P0 scope item from the build prompt maps to a task:

| P0 scope item | Task(s) |
|---|---|
| Remake protocol: relocate `lib/`/`types/`/`test/` → `reference/`, build fresh `lib/` | 0 (+ all engine/data tasks) |
| Re-add full Next 16 stack to `package.json` (next 16.2.7, react 19, recharts, better-sqlite3, tailwind v4, testing libs, vitest, tsx, types) | 0 |
| Restore `tsconfig` (jsx react-jsx, next plugin, `@/*`), `next.config.ts`, `postcss.config.mjs`, `app/globals.css` (Tailwind v4 + tokens), `app/layout.tsx` | 0 |
| Remade `lib/ll97/constants.ts` (ESPM factors verbatim + source comments, penalty 268, period columns) | 1 |
| Remade `lib/ll97/engine.ts` (computeFine / computeAllPeriods / Article 321 per contract) | 2 (resolver) + 3 |
| GOLDEN TEST reproducing DOB's published worked example exactly | 3 |
| Remade `lib/ll97/emissions.ts` (recomputeEmissions per contract) | 4 |
| Data layer `types`, `geosearch` (DOF-aware), `ll84` (latest-wins, NA→null, LL84→ESPM mapping), `coveredBuildings`, `lookup` (provenance) | 5, 6, 7 |
| Pure parsers tested against committed fixtures (offline) | 5, 6, 7 |
| Local cache `lib/data/cache.ts` (better-sqlite3 read/write) | 8 |
| `scripts/fetch-ll84.ts` (Socrata→SQLite) + pre-cache 3 demo buildings (incl. affordable) committed as fixtures | 8 |
| API `app/api/building/route.ts` (POST {address\|bbl} → {facts, fines}) returning `Response.json` | 9 |
| UI `app/page.tsx` + SearchBar, ResultCard, CliffChart (bars + two limit lines, 2030 red when over), ProvenanceFootnote (notes + provenance verbatim) | 10 |
| Verification: tsc --noEmit, npm test green, npm run build passes | 11 |

**Contract conformance:** Every exported type/field name matches the LOCKED INTERFACE CONTRACT verbatim — `BuildingInput`, `FineResult` (`period`, `emissionsLimitTco2e`, `actualEmissionsTco2e`, `overageTco2e`, `annualFineUsd`, `compliant`, `pathway`, `notes`), `Period`/`PERIODS`, `FuelUse`, `recomputeEmissions` returning `{ tco2e, unpriceableFuels }`, `Bbl`/`BblResult`/`UseSplit`/`ProvenanceNote`/`Ll84Facts`/`BuildingFacts`/`CblEntry`, `lookupBuilding(address, sources?)`, `getCblEntry`/`isLl97Covered`. No field was renamed.

**No placeholder strings:** every code step contains complete, runnable TypeScript with real coefficients (the full 60-row ESPM table), real test assertions, and hand-verified golden numbers (302.40 / 149.93 / 120.61 limits; 287.00 emissions; $36,734.90 and $26,156.80 fines). No "TBD", no "add error handling", no "similar to above".

**The one rule holds:** P0 has no AI path, so code computes every number trivially; the data structures (`FineResult.notes`, `BuildingFacts.provenance`) are shaped so P1's Claude only narrates these arrays — it never recomputes.
