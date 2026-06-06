# FinePrint v2 — P3 Agentic Ingestion — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — use `superpowers:test-driven-development` for every `lib/` task (write the failing test, run it, see it FAIL, write minimal impl, run it, see it PASS, commit). Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to drive the plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This plan ASSUMES **P0 + P1 are DONE** per the contract in `docs/superpowers/plans/2026-06-06-fineprint-v2-implementation-index.md`: `lib/ll97/engine.ts` exports `BuildingInput`/`computeAllPeriods`, `lib/data/lookup.ts` exports `lookupBuilding`, `lib/optimize/retrofit.ts` exports `optimizeRetrofit`, `lib/ai/advise.ts` exports `generateAdvice`, `lib/ai/ask.ts` exports `answerLawQuestion`, and `app/page.tsx` renders the single-building flow. P3 adds the **ingestion** seam in front of that pipeline. Do NOT alter any P0/P1 file's public signature; only add new files and one new UI panel.

**Goal:** Let a user paste the raw text of a utility bill, an ENERGY STAR Portfolio Manager (ESPM) export, or an energy-audit summary, have Claude **extract and structure** (never compute) the building's gross floor area, occupancy-group splits (ESPM property-type names), and fuel consumption / reported emissions into a `Partial<BuildingInput>`, then pre-fill the existing building-input form so the extracted facts feed straight through the P0/P1 pipeline (lookup-or-manual → `computeAllPeriods` → `optimizeRetrofit` → `generateAdvice`). The LLM extracts only; the deterministic engine still owns every number. With no API key, a regex fallback extracts the obvious labeled fields and the badge reads "estimated". The whole feature is framed as small composable agents and tested at every seam against committed fixtures with a mocked client.

**Architecture:** Six composable steps, each a pure-ish function with a typed input/output, wired by an optional orchestrator. The **only** new LLM call is `extractBuildingInput` (text → `Partial<BuildingInput>`, extraction-only). Everything downstream is the unchanged P0/P1 engine + optimizer + advise + RAG.

```
                          ┌─────────────────────────────────────────────────────────┐
 pasted document text ───▶│ 1. ingest    lib/ai/extract.ts                           │
 (utility bill / ESPM /   │    extractBuildingInput(text) -> Partial<BuildingInput>  │  ← LLM (structured output) OR regex fallback
  audit, TEXT only)       │    + ExtractionResult.filled[] / left null[] (honesty)  │
                          └───────────────────────────┬─────────────────────────────┘
                                                       │ Partial<BuildingInput>
                                                       ▼
                          ┌─────────────────────────────────────────────────────────┐
 POST /api/ingest {text} ─▶│ app/api/ingest/route.ts -> Response.json(ExtractionResult)│
                          └───────────────────────────┬─────────────────────────────┘
                                                       │ pre-fills the form fields
                                                       ▼
   2. structure (merge extracted Partial with form/lookup) → complete BuildingInput
   3. compliance RAG    lib/ai/ask.answerLawQuestion(q)      (P1, unchanged — optional “does this qualify?” step)
   4. optimize          lib/optimize/retrofit.optimizeRetrofit(...) (P1, unchanged)
   5. narrate           lib/ai/advise.generateAdvice(...)          (P1, unchanged)
   (orchestrated by the optional lib/ai/pipeline.ts seam)
```

**The one inviolable rule (carried from P0/P1):** Code computes every number; Claude only ranks, explains, narrates, **extracts**, and cites. `extractBuildingInput` is told, structurally and in its system prompt, to TRANSCRIBE numbers from the document verbatim and NEVER to compute, convert, derive, or invent any value (no unit conversions, no emissions math, no summing). Any field the document does not state is returned `null` and surfaced as "left blank by extraction" in the UI. The engine recomputes emissions from fuel via `recomputeEmissions`; the extractor never does.

**Tech Stack:** Next.js 16 (App Router, `Response.json(...)` — not `NextResponse`) · React 19 · TypeScript · Tailwind v4 · `@anthropic-ai/sdk` `^0.100.1` (model `claude-opus-4-8`, structured output via `output_config.format` + `effort`) · Vitest `^4` (`vitest.config.ts` includes `lib/**/*.test.ts` and `app/**/*.test.ts`; `vite-tsconfig-paths` resolves `@/*`). Tests run offline with a mocked SDK client (`vi.doMock('@anthropic-ai/sdk', ...)`). **PDF→text is out of scope for the core** — extraction operates on TEXT. A note in the UI explains that a client-side `pdf.js` paste-the-text path keeps the feature dependency-light and offline-friendly; no PDF parser is added.

---

## Task 1 — Extraction types + regex fallback (`lib/ai/extract.ts`, fallback path, TDD)

The fallback must work with **no API key** and is the deterministic floor of the whole feature, so build and test it first, before the LLM path.

**Files**
- Create: `lib/ai/extract.ts`
- Create (fixtures): `lib/ai/fixtures/espm-export.txt`, `lib/ai/fixtures/utility-bill.txt`, `lib/ai/fixtures/audit-summary.txt`
- Create (test): `lib/ai/extract.test.ts`

**Steps**

1. - [ ] Write the committed fixture `lib/ai/fixtures/espm-export.txt` (a synthetic ESPM "Reporting" export snippet). Real labels, no real building:

```
ENERGY STAR Portfolio Manager
Property Report — Reporting Year 2024

Property Name: Maple Court Apartments (SYNTHETIC — test fixture)
Property ID: 0000000
Address: 000 Test Avenue, Brooklyn, NY 11200

Property Gross Floor Area (ft²): 84,500
Property Types - Self-Selected:
  Multifamily Housing — Gross Floor Area (ft²): 78,000
  Retail Store — Gross Floor Area (ft²): 6,500

Site Energy Use Details:
  Electricity Use - Grid Purchase (kWh): 1,240,000
  Natural Gas Use (kBtu): 6,800,000
  Fuel Oil (No. 2) Use (kBtu): 0

Total (Location-Based) GHG Emissions (Metric Tons CO2e): 612.40
Total (Location-Based) GHG Emissions Intensity (kgCO2e/ft²): 7.25
```

2. - [ ] Write the committed fixture `lib/ai/fixtures/utility-bill.txt` (a synthetic Con Edison-style bill with gas + electric but NO gross floor area and NO emissions — to prove `null`s are surfaced honestly):

```
Con Edison — Energy Bill (SYNTHETIC — test fixture)
Service Address: 000 Test Avenue, Brooklyn, NY 11200
Billing Period: 03/01/2024 - 03/31/2024

ELECTRICITY
  Total kWh used this period: 103,500 kWh

GAS
  Total therms used this period: 5,400 therms
  (1 therm = 100 cubic feet)

Amount due: $18,402.55
```

3. - [ ] Write the committed fixture `lib/ai/fixtures/audit-summary.txt` (a synthetic LL87-style energy-audit summary with GFA + reported emissions but no fuel breakdown):

```
Energy Audit & Retro-Commissioning Summary (SYNTHETIC — test fixture)
Building: 000 Test Avenue, Brooklyn, NY 11200

Gross Floor Area: 84,500 sq ft
Primary Use: Multifamily Housing
Reported Annual GHG Emissions: 612.4 metric tons CO2e
Audit Year: 2024
```

4. - [ ] In `lib/ai/extract.ts`, write the public types and a typed, source-tagged result shape. `BuildingInput` is the locked P0 contract — import it; never redefine it.

```ts
import type { BuildingInput } from '@/lib/ll97/engine';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

/** Which fields the extractor populated vs. left null — surfaced verbatim in the UI for honesty. */
export interface ExtractionResult {
  /** The structured fields the extractor was confident enough to fill. Engine still recomputes numbers. */
  input: Partial<BuildingInput>;
  /** Top-level BuildingInput keys the extractor populated. */
  filled: Array<keyof BuildingInput>;
  /** Top-level BuildingInput keys the extractor could NOT find in the document (left null). */
  missing: Array<keyof BuildingInput>;
  /** 'ai' when Claude structured the text; 'fallback' when the regex path ran (no key / error). */
  source: 'ai' | 'fallback';
  /** Short human note for the UI, e.g. "Pasted text parsed by regex; verify every field." */
  note: string;
}

const ALL_KEYS: Array<keyof BuildingInput> = [
  'grossFloorAreaSqft',
  'occupancyGroups',
  'annualEmissionsTco2e',
  'isArticle321',
];
```

5. - [ ] Add a pure `parseNumber` helper (strips thousands separators) and a pure `regexExtract(text): Partial<BuildingInput>` that recognizes the obvious labeled fields ONLY. It must NOT convert units or sum anything — therms/kWh/kBtu are NOT mapped to `annualEmissionsTco2e` (the engine does that). It captures:
   - `grossFloorAreaSqft` from `Gross Floor Area: N`, `Property Gross Floor Area (ft²): N`, or `N sq ft` near "Gross Floor Area".
   - `annualEmissionsTco2e` from `Total ... GHG Emissions (Metric Tons CO2e): N` or `Reported Annual GHG Emissions: N metric tons CO2e`.
   - `occupancyGroups` from `Property Types`/`Primary Use` lines that name an ESPM type with a `Gross Floor Area (ft²): N` on the same line; if only a single `Primary Use: X` with no per-type sqft, emit one group with the building GFA when GFA is known, else skip.

```ts
function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Deterministic floor: regex over obvious labeled fields. Never computes, converts, or sums. */
export function regexExtract(text: string): Partial<BuildingInput> {
  const out: Partial<BuildingInput> = {};

  const gfaMatch =
    text.match(/Gross Floor Area\s*(?:\(ft²\))?\s*:?\s*([\d,]+)\s*(?:sq\s*ft|ft²)?/i) ??
    text.match(/Property Gross Floor Area\s*\(ft²\)\s*:\s*([\d,]+)/i);
  if (gfaMatch) {
    const gfa = parseNumber(gfaMatch[1]);
    if (gfa !== null) out.grossFloorAreaSqft = gfa;
  }

  const emMatch =
    text.match(/Total[^\n]*GHG Emissions[^\n:]*\(Metric Tons CO2e\)\s*:?\s*([\d,]+(?:\.\d+)?)/i) ??
    text.match(/Reported Annual GHG Emissions\s*:?\s*([\d,]+(?:\.\d+)?)\s*metric tons CO2e/i);
  if (emMatch) {
    const em = parseNumber(emMatch[1]);
    if (em !== null) out.annualEmissionsTco2e = em;
  }

  const groups: Array<{ group: string; sqft: number }> = [];
  const typeLine = /^[ \t]*([A-Za-z][A-Za-z /&'-]+?)\s*[—-]\s*Gross Floor Area\s*\(ft²\)\s*:\s*([\d,]+)/gim;
  for (const m of text.matchAll(typeLine)) {
    const sqft = parseNumber(m[2]);
    if (sqft !== null) groups.push({ group: m[1].trim(), sqft });
  }
  if (groups.length === 0) {
    const primary = text.match(/Primary Use\s*:?\s*([A-Za-z][A-Za-z /&'-]+)/i);
    if (primary && out.grossFloorAreaSqft != null) {
      groups.push({ group: primary[1].trim(), sqft: out.grossFloorAreaSqft });
    }
  }
  if (groups.length > 0) out.occupancyGroups = groups;

  return out;
}

function summarize(input: Partial<BuildingInput>, source: 'ai' | 'fallback', note: string): ExtractionResult {
  const filled = ALL_KEYS.filter(k => input[k] !== undefined && input[k] !== null);
  const missing = ALL_KEYS.filter(k => !filled.includes(k));
  return { input, filled, missing, source, note };
}
```

6. - [ ] Add the public entry point with the fallback wired first (the AI branch is filled in Task 2). Mirror the proven `advise.ts` shape: no key OR empty text ⇒ fallback; AI path in `try`, fallback in `catch`.

```ts
/** Extract & STRUCTURE building facts from pasted document text. LLM never computes a number. */
export async function extractBuildingInput(text: string): Promise<ExtractionResult> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return summarize({}, 'fallback', 'No text provided.');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return summarize(regexExtract(trimmed), 'fallback', 'Pasted text parsed by regex (no AI key); verify every field.');
  }
  // AI path — implemented in Task 2.
  return aiExtract(trimmed);
}
```

7. - [ ] Add a temporary stub so the file type-checks before Task 2: `async function aiExtract(text: string): Promise<ExtractionResult> { return summarize(regexExtract(text), 'fallback', 'stub'); }`. (Task 2 replaces the body.)

8. - [ ] Write `lib/ai/extract.test.ts` covering the fallback + regex against all three fixtures. Read fixtures with `readFileSync` + `import.meta.url` (Node test env). Assert exact numbers and the honesty `filled`/`missing` split.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { regexExtract, extractBuildingInput } from './extract';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

describe('regexExtract (pure, no key needed)', () => {
  it('pulls GFA, both occupancy groups, and reported emissions from an ESPM export', () => {
    const out = regexExtract(fixture('espm-export.txt'));
    expect(out.grossFloorAreaSqft).toBe(84500);
    expect(out.annualEmissionsTco2e).toBe(612.4);
    expect(out.occupancyGroups).toEqual([
      { group: 'Multifamily Housing', sqft: 78000 },
      { group: 'Retail Store', sqft: 6500 },
    ]);
  });

  it('leaves GFA and emissions null for a utility bill that states neither (no unit conversion)', () => {
    const out = regexExtract(fixture('utility-bill.txt'));
    expect(out.grossFloorAreaSqft).toBeUndefined();
    expect(out.annualEmissionsTco2e).toBeUndefined();
    expect(out.occupancyGroups).toBeUndefined();
  });

  it('pulls GFA + reported emissions + single primary-use group from an audit summary', () => {
    const out = regexExtract(fixture('audit-summary.txt'));
    expect(out.grossFloorAreaSqft).toBe(84500);
    expect(out.annualEmissionsTco2e).toBe(612.4);
    expect(out.occupancyGroups).toEqual([{ group: 'Multifamily Housing', sqft: 84500 }]);
  });
});

describe('extractBuildingInput (fallback path — no API key)', () => {
  const orig = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig; });

  it('returns source:"fallback" and the honesty filled/missing split for the ESPM fixture', async () => {
    const res = await extractBuildingInput(fixture('espm-export.txt'));
    expect(res.source).toBe('fallback');
    expect(res.filled).toEqual(
      expect.arrayContaining(['grossFloorAreaSqft', 'occupancyGroups', 'annualEmissionsTco2e']),
    );
    expect(res.missing).toContain('isArticle321'); // never inferable from a document
  });

  it('reports utility-bill fields as missing rather than guessing them', async () => {
    const res = await extractBuildingInput(fixture('utility-bill.txt'));
    expect(res.source).toBe('fallback');
    expect(res.missing).toEqual(
      expect.arrayContaining(['grossFloorAreaSqft', 'annualEmissionsTco2e', 'occupancyGroups']),
    );
  });

  it('returns empty fallback for blank text', async () => {
    const res = await extractBuildingInput('   ');
    expect(res.source).toBe('fallback');
    expect(res.filled).toEqual([]);
    expect(res.note).toMatch(/No text/i);
  });
});
```

9. - [ ] Run and watch it FAIL (file/exports not complete yet):
   `npx vitest run lib/ai/extract.test.ts`
   Expected: FAIL (e.g. `regexExtract is not a function` or assertion mismatches).

10. - [ ] Implement until green (the code in steps 4–7). Run:
    `npx vitest run lib/ai/extract.test.ts`
    Expected: PASS — all 6 tests green.

11. - [ ] Type-check: `npx tsc --noEmit` → no errors.

12. - [ ] Commit:
```
git add lib/ai/extract.ts lib/ai/extract.test.ts lib/ai/fixtures/
git commit -m "feat(ingest): extract.ts regex fallback + ESPM/bill/audit fixtures (no number computation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Claude extraction path (`aiExtract` in `lib/ai/extract.ts`, structured output, mocked-client TDD)

Replace the stub with a real Claude call using structured output (`output_config.format` json_schema + `effort`), the exact pattern verified in `lib/ai/advise.ts`. The schema mirrors `BuildingInput`; the system prompt forbids computation; nullable fields encode "not found".

**Files**
- Modify: `lib/ai/extract.ts`
- Modify (test): `lib/ai/extract.test.ts` (add the mocked-AI describe block)

**Steps**

1. - [ ] Add the imports + JSON schema + system prompt at the top of `lib/ai/extract.ts`. Every numeric field is nullable so "not stated in the document" round-trips as `null`.

```ts
import Anthropic from '@anthropic-ai/sdk';

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    grossFloorAreaSqft: {
      type: ['number', 'null'],
      description: 'Gross floor area in square feet, transcribed verbatim from the document. null if not stated.',
    },
    occupancyGroups: {
      type: 'array',
      description: 'Occupancy/property-type splits using ESPM property-type names exactly as written, each with its square footage. Empty array if none stated.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          group: { type: 'string', description: 'ESPM property-type name, copied verbatim (e.g. "Multifamily Housing", "Retail Store").' },
          sqft: { type: 'number', description: 'Square footage for this property type, transcribed verbatim.' },
        },
        required: ['group', 'sqft'],
      },
    },
    annualEmissionsTco2e: {
      type: ['number', 'null'],
      description: 'Total reported annual GHG emissions in metric tons CO2e, transcribed verbatim. null if the document does not state a total emissions figure. NEVER compute this from fuel use.',
    },
  },
  required: ['grossFloorAreaSqft', 'occupancyGroups', 'annualEmissionsTco2e'],
} as const;

const EXTRACT_SYSTEM = `You extract structured building facts from the raw text of a NYC utility bill, ENERGY STAR Portfolio Manager export, or energy-audit summary.
You are a TRANSCRIBER, not a calculator. Copy numbers exactly as the document states them. Use the ESPM property-type names exactly as written.
NEVER compute, convert, derive, sum, or estimate any value. Do NOT convert therms/kWh/kBtu into emissions or into each other. Do NOT add up partial areas. Do NOT infer a total emissions figure from fuel use — if the document does not print a total GHG emissions number, return null for annualEmissionsTco2e.
If a field is not present in the document, return null (or an empty array for occupancyGroups). Do not guess. A downstream deterministic engine performs all calculations.`;
```

2. - [ ] Replace the stubbed `aiExtract` body. Parse the structured JSON, drop nulls so they become "missing", and never let `isArticle321` come from the document (it is a user toggle by design — always missing here). On any error, fall back to `regexExtract`.

```ts
async function aiExtract(text: string): Promise<ExtractionResult> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: EXTRACT_SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
      messages: [{ role: 'user', content: `Extract the building facts from this document text:\n\n${text}` }],
    });
    const block = res.content.find((b: Anthropic.ContentBlock) => b.type === 'text') as Anthropic.TextBlock | undefined;
    const parsed = JSON.parse(block?.text ?? '{}') as {
      grossFloorAreaSqft?: number | null;
      occupancyGroups?: Array<{ group: string; sqft: number }> | null;
      annualEmissionsTco2e?: number | null;
    };

    const input: Partial<BuildingInput> = {};
    if (typeof parsed.grossFloorAreaSqft === 'number') input.grossFloorAreaSqft = parsed.grossFloorAreaSqft;
    if (typeof parsed.annualEmissionsTco2e === 'number') input.annualEmissionsTco2e = parsed.annualEmissionsTco2e;
    if (Array.isArray(parsed.occupancyGroups) && parsed.occupancyGroups.length > 0) {
      input.occupancyGroups = parsed.occupancyGroups.filter(
        g => typeof g?.group === 'string' && typeof g?.sqft === 'number',
      );
      if (input.occupancyGroups.length === 0) delete input.occupancyGroups;
    }
    // isArticle321 is a user toggle (un-provable from a document) — never set it here.
    return summarize(input, 'ai', 'Extracted by Claude (structured output); numbers transcribed, not computed. Verify against the document.');
  } catch {
    return summarize(regexExtract(text), 'fallback', 'AI extraction failed; fell back to regex. Verify every field.');
  }
}
```

3. - [ ] Add the mocked-AI describe block to `lib/ai/extract.test.ts`. Use the exact `vi.resetModules()` → `vi.doMock('@anthropic-ai/sdk', ...)` → dynamic `import` pattern proven in `lib/ai/advise.test.ts`. Assert numbers are preserved verbatim, nulls become `missing`, and `isArticle321` is never filled.

```ts
import { vi } from 'vitest';

describe('extractBuildingInput (mocked AI path)', () => {
  it('preserves transcribed numbers and reports nulls as missing', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-mock';
    vi.resetModules();

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          grossFloorAreaSqft: 84500,
          occupancyGroups: [{ group: 'Multifamily Housing', sqft: 78000 }, { group: 'Retail Store', sqft: 6500 }],
          annualEmissionsTco2e: null, // document had fuel use but no total — model must NOT compute it
        }),
      }],
    });
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: function MockAnthropic() { return { messages: { create: mockCreate } }; },
    }));

    try {
      const { extractBuildingInput } = await import('./extract');
      const res = await extractBuildingInput('any non-empty text triggers the AI path');
      expect(res.source).toBe('ai');
      expect(res.input.grossFloorAreaSqft).toBe(84500);
      expect(res.input.occupancyGroups).toEqual([
        { group: 'Multifamily Housing', sqft: 78000 },
        { group: 'Retail Store', sqft: 6500 },
      ]);
      // null emissions: must be reported missing, never fabricated.
      expect(res.input.annualEmissionsTco2e).toBeUndefined();
      expect(res.missing).toContain('annualEmissionsTco2e');
      expect(res.filled).toEqual(expect.arrayContaining(['grossFloorAreaSqft', 'occupancyGroups']));
      // isArticle321 is a user toggle — extraction never fills it.
      expect(res.missing).toContain('isArticle321');
      expect(mockCreate).toHaveBeenCalledOnce();
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig; else delete process.env.ANTHROPIC_API_KEY;
      vi.resetModules();
    }
  });

  it('falls back to regex when the AI client throws', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-mock';
    vi.resetModules();
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: function MockAnthropic() { return { messages: { create: vi.fn().mockRejectedValue(new Error('boom')) } }; },
    }));
    try {
      const { extractBuildingInput } = await import('./extract');
      const res = await extractBuildingInput('Gross Floor Area: 50,000 sq ft\nPrimary Use: Office');
      expect(res.source).toBe('fallback');
      expect(res.input.grossFloorAreaSqft).toBe(50000);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig; else delete process.env.ANTHROPIC_API_KEY;
      vi.resetModules();
    }
  });
});
```

4. - [ ] Run and watch the NEW tests FAIL first (stub still returns `source:'fallback'` for the AI case):
   `npx vitest run lib/ai/extract.test.ts`
   Expected: the "mocked AI path" tests FAIL (`source` is `'fallback'`, not `'ai'`).

5. - [ ] Implement the real `aiExtract` (steps 1–2). Run again:
   `npx vitest run lib/ai/extract.test.ts`
   Expected: PASS — all 8 tests green (6 from Task 1 + 2 mocked-AI).

6. - [ ] Type-check: `npx tsc --noEmit` → no errors.

7. - [ ] Commit:
```
git add lib/ai/extract.ts lib/ai/extract.test.ts
git commit -m "feat(ingest): Claude structured-output extraction path (transcribe-only, nullable -> missing)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — `POST /api/ingest` route (`app/api/ingest/route.ts`, TDD)

The contract route: `POST /api/ingest { text } -> ExtractionResult` (which carries `Partial<BuildingInput>` plus the honesty metadata). Return web-standard `Response.json(...)` per Next 16 convention. Read `node_modules/next/dist/docs/` before writing the handler if any route-handler API is unfamiliar.

**Files**
- Create: `app/api/ingest/route.ts`
- Create (test): `app/api/ingest/route.test.ts`

**Steps**

1. - [ ] Write the route. Guard for a string `text`; delegate to `extractBuildingInput`; 400 on bad body. The route does NOT compute anything; it just returns the extractor's structured result.

```ts
import { extractBuildingInput } from '@/lib/ai/extract';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== 'string') {
    return Response.json({ error: 'Expected { text: string }.' }, { status: 400 });
  }
  const result = await extractBuildingInput(text);
  return Response.json(result);
}
```

2. - [ ] Write `app/api/ingest/route.test.ts`. Drive the handler directly with a `Request` (no server needed). Force the fallback path by deleting the key so the test is deterministic and offline; assert the round-trip carries the structured fields.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { POST } from './route';

const espm = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'lib', 'ai', 'fixtures', 'espm-export.txt'),
  'utf8',
);

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

describe('POST /api/ingest', () => {
  const orig = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig; });

  it('returns an ExtractionResult with the parsed Partial<BuildingInput>', async () => {
    const res = await post({ text: espm });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe('fallback');
    expect(json.input.grossFloorAreaSqft).toBe(84500);
    expect(json.input.annualEmissionsTco2e).toBe(612.4);
    expect(json.filled).toEqual(expect.arrayContaining(['grossFloorAreaSqft', 'occupancyGroups', 'annualEmissionsTco2e']));
    expect(json.missing).toContain('isArticle321');
  });

  it('400s when text is missing', async () => {
    const res = await post({ notText: 1 });
    expect(res.status).toBe(400);
  });

  it('400s on invalid JSON', async () => {
    const res = await POST(new Request('http://localhost/api/ingest', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
```

3. - [ ] Run and watch it FAIL (route not created / not wired):
   `npx vitest run app/api/ingest/route.test.ts`
   Expected: FAIL (import error or 404-shaped failure).

4. - [ ] Implement the route (step 1). Run:
   `npx vitest run app/api/ingest/route.test.ts`
   Expected: PASS — 3 tests green.

5. - [ ] Full suite stays green + type-check:
   `npm test` (all P0/P1/P3 tests pass) and `npx tsc --noEmit`.

6. - [ ] Commit:
```
git add app/api/ingest/route.ts app/api/ingest/route.test.ts
git commit -m "feat(ingest): POST /api/ingest returns Partial<BuildingInput> (Response.json, Next 16)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Agent pipeline seam (`lib/ai/pipeline.ts`, TDD with mocks at the seam)

A small, optional orchestration module documenting the agents as composable steps and tying ingest → structure → optimize → narrate (RAG is an optional side query). It exists so the agent framing is real code, tested at the seam — not prose. It depends only on the locked P0/P1 signatures, so it is mockable end-to-end without the network.

**Files**
- Create: `lib/ai/pipeline.ts`
- Create (test): `lib/ai/pipeline.test.ts`

**Steps**

1. - [ ] Write `lib/ai/pipeline.ts`. Step 2 ("structure") merges the extracted `Partial<BuildingInput>` with any form/lookup overrides into a complete `BuildingInput`, validates it is complete enough to compute, then runs the unchanged engine → optimizer → advise. Each step's input/output is named in a comment so the agent framing is legible.

```ts
import type { BuildingInput, FineResult } from '@/lib/ll97/engine';
import { computeAllPeriods } from '@/lib/ll97/engine';
import type { ExtractionResult } from '@/lib/ai/extract';
import { extractBuildingInput } from '@/lib/ai/extract';

/** Merge result of step 2 — a fully-formed BuildingInput plus which fields still came from the user/lookup. */
export interface StructuredBuilding {
  input: BuildingInput;
  filledByExtraction: Array<keyof BuildingInput>;
  filledByUser: Array<keyof BuildingInput>;
}

/** Step 2 — STRUCTURE: extracted Partial + user/lookup overrides -> complete BuildingInput. Pure, no LLM. */
export function structureBuilding(
  extracted: Partial<BuildingInput>,
  overrides: Partial<BuildingInput>,
): StructuredBuilding {
  const merged: Partial<BuildingInput> = { ...extracted, ...overrides };
  const filledByExtraction = (Object.keys(extracted) as Array<keyof BuildingInput>)
    .filter(k => overrides[k] === undefined && extracted[k] !== undefined && extracted[k] !== null);
  const filledByUser = (Object.keys(overrides) as Array<keyof BuildingInput>)
    .filter(k => overrides[k] !== undefined);

  if (
    typeof merged.grossFloorAreaSqft !== 'number' ||
    !Array.isArray(merged.occupancyGroups) || merged.occupancyGroups.length === 0 ||
    typeof merged.annualEmissionsTco2e !== 'number'
  ) {
    throw new Error('Incomplete BuildingInput: grossFloorAreaSqft, occupancyGroups, and annualEmissionsTco2e are required.');
  }
  const input: BuildingInput = {
    grossFloorAreaSqft: merged.grossFloorAreaSqft,
    occupancyGroups: merged.occupancyGroups,
    annualEmissionsTco2e: merged.annualEmissionsTco2e,
    isArticle321: merged.isArticle321 ?? false,
  };
  return { input, filledByExtraction, filledByUser };
}

export interface IngestPipelineResult {
  structured: StructuredBuilding;
  fines: FineResult[];
  extraction: ExtractionResult;
}

/**
 * Orchestrate the ingestion-fronted pipeline up to deterministic fines.
 * 1. ingest    — extractBuildingInput(text) -> Partial<BuildingInput>      (LLM extract-only)
 * 2. structure — structureBuilding(extracted, overrides) -> BuildingInput  (pure)
 * 3. compute   — computeAllPeriods(input) -> FineResult[]                  (deterministic engine, owns the numbers)
 * (optimize via optimizeRetrofit and narrate via generateAdvice are called by the page from `fines`.)
 */
export async function runIngestPipeline(
  text: string,
  overrides: Partial<BuildingInput> = {},
): Promise<IngestPipelineResult> {
  const extraction = await extractBuildingInput(text);      // step 1
  const structured = structureBuilding(extraction.input, overrides); // step 2
  const fines = computeAllPeriods(structured.input);        // step 3 (numbers from the engine, never the LLM)
  return { structured, fines, extraction };
}
```

2. - [ ] Write `lib/ai/pipeline.test.ts`. Unit-test `structureBuilding` purely (merge precedence, completeness guard). Test `runIngestPipeline` at the seam by mocking `@/lib/ai/extract` and `@/lib/ll97/engine` so it is offline and deterministic and proves the LLM output flows into the engine unchanged.

```ts
import { describe, it, expect, vi } from 'vitest';
import { structureBuilding } from './pipeline';
import type { BuildingInput } from '@/lib/ll97/engine';

const extracted: Partial<BuildingInput> = {
  grossFloorAreaSqft: 84500,
  occupancyGroups: [{ group: 'Multifamily Housing', sqft: 84500 }],
  annualEmissionsTco2e: 612.4,
};

describe('structureBuilding (pure step 2)', () => {
  it('merges extraction with no overrides into a complete BuildingInput (isArticle321 defaults false)', () => {
    const s = structureBuilding(extracted, {});
    expect(s.input).toEqual({
      grossFloorAreaSqft: 84500,
      occupancyGroups: [{ group: 'Multifamily Housing', sqft: 84500 }],
      annualEmissionsTco2e: 612.4,
      isArticle321: false,
    });
    expect(s.filledByExtraction).toEqual(
      expect.arrayContaining(['grossFloorAreaSqft', 'occupancyGroups', 'annualEmissionsTco2e']),
    );
    expect(s.filledByUser).toEqual([]);
  });

  it('lets a user override (Article 321 toggle) win over extraction', () => {
    const s = structureBuilding(extracted, { isArticle321: true, grossFloorAreaSqft: 90000 });
    expect(s.input.isArticle321).toBe(true);
    expect(s.input.grossFloorAreaSqft).toBe(90000);
    expect(s.filledByUser).toEqual(expect.arrayContaining(['isArticle321', 'grossFloorAreaSqft']));
    expect(s.filledByExtraction).not.toContain('grossFloorAreaSqft'); // overridden by user
  });

  it('throws when extraction + overrides are still incomplete (no emissions)', () => {
    expect(() => structureBuilding({ grossFloorAreaSqft: 84500, occupancyGroups: [{ group: 'X', sqft: 84500 }] }, {}))
      .toThrow(/Incomplete BuildingInput/);
  });
});

describe('runIngestPipeline (seam: LLM output -> engine, mocked)', () => {
  it('passes the extracted input into computeAllPeriods unchanged', async () => {
    vi.resetModules();
    const computeAllPeriods = vi.fn().mockReturnValue([{ period: '2030-2034', annualFineUsd: 12345 }]);
    vi.doMock('@/lib/ll97/engine', () => ({ computeAllPeriods }));
    vi.doMock('@/lib/ai/extract', () => ({
      extractBuildingInput: vi.fn().mockResolvedValue({ input: extracted, filled: [], missing: [], source: 'ai', note: 'x' }),
    }));
    try {
      const { runIngestPipeline } = await import('./pipeline');
      const res = await runIngestPipeline('pasted text', {});
      expect(computeAllPeriods).toHaveBeenCalledWith(expect.objectContaining({ grossFloorAreaSqft: 84500, annualEmissionsTco2e: 612.4 }));
      expect(res.fines[0].annualFineUsd).toBe(12345);
      expect(res.extraction.source).toBe('ai');
    } finally {
      vi.resetModules();
    }
  });
});
```

3. - [ ] Run and watch it FAIL:
   `npx vitest run lib/ai/pipeline.test.ts`
   Expected: FAIL (module/exports missing).

4. - [ ] Implement `lib/ai/pipeline.ts` (step 1). Run:
   `npx vitest run lib/ai/pipeline.test.ts`
   Expected: PASS — 4 tests green.

5. - [ ] Type-check: `npx tsc --noEmit` → no errors.

6. - [ ] Commit:
```
git add lib/ai/pipeline.ts lib/ai/pipeline.test.ts
git commit -m "feat(ingest): pipeline.ts agent seam (ingest -> structure -> compute), tested at the seam with mocks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Upload/paste UI panel + PDF note (`app/page.tsx` + `components/IngestPanel.tsx`)

Add a paste panel that posts to `/api/ingest`, pre-fills the existing building-input form from the returned `Partial<BuildingInput>`, then lets the user run the existing P0/P1 flow. Show which fields the LLM filled vs. left null (honesty). UI is verified by build + screenshots, not unit tests (per project convention).

**Files**
- Create: `components/IngestPanel.tsx`
- Modify: `app/page.tsx` (mount the panel above the building-input form; wire its `onExtract` to set the form state)

**Steps**

1. - [ ] Create `components/IngestPanel.tsx` — a client component (`'use client'`) with a `<textarea>` for pasted text, a "Extract fields" button (`active:scale-[0.97]`, animate only transform/opacity, respect `prefers-reduced-motion`), and a results strip listing filled vs. missing fields. It calls `/api/ingest`, then invokes `onExtract(result.input)`; it renders a labeled "estimated" badge when `result.source === 'fallback'`.

```tsx
'use client';
import { useState } from 'react';
import type { BuildingInput } from '@/lib/ll97/engine';
import type { ExtractionResult } from '@/lib/ai/extract';

export function IngestPanel({ onExtract }: { onExtract: (input: Partial<BuildingInput>) => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data: ExtractionResult = await res.json();
      setResult(data);
      onExtract(data.input);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border p-4">
      <h2 className="text-sm font-semibold">Paste a utility bill, ESPM export, or audit summary</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Paste the document <strong>text</strong>. Claude extracts the fields; the engine still computes every number.
        For a PDF, copy its text (or use a client-side pdf.js paste) — PDF parsing is intentionally out of scope to keep this offline-friendly.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={8}
        className="mt-3 w-full rounded-lg border p-2 font-mono text-xs"
        placeholder="Property Gross Floor Area (ft²): 84,500 …"
      />
      <button
        onClick={run}
        disabled={busy || !text.trim()}
        className="mt-3 rounded-lg border px-4 py-2 text-sm transition active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {busy ? 'Extracting…' : 'Extract fields'}
      </button>

      {result && (
        <div className="mt-4 text-xs">
          <span className="rounded-full border px-2 py-0.5 tabular-nums">
            {result.source === 'ai' ? 'AI-extracted' : 'estimated (regex)'}
          </span>
          <p className="mt-2 text-neutral-600">{result.note}</p>
          <p className="mt-2"><strong>Filled:</strong> {result.filled.length ? result.filled.join(', ') : '—'}</p>
          <p><strong>Left blank (verify or enter manually):</strong> {result.missing.length ? result.missing.join(', ') : '—'}</p>
        </div>
      )}
    </section>
  );
}
```

2. - [ ] In `app/page.tsx`, import `IngestPanel` and mount it above the existing building-input form. Wire `onExtract` to merge the extracted `Partial<BuildingInput>` into the form's controlled state (only overwriting fields the extractor filled; leave `missing` fields for the user). Do NOT change the existing lookup/compute/optimize/advise wiring — extraction is an additional entry point into the same state.

```tsx
// inside the page component, alongside the existing form state setters:
<IngestPanel
  onExtract={(input) => {
    if (input.grossFloorAreaSqft != null) setGfa(input.grossFloorAreaSqft);
    if (input.occupancyGroups) setOccupancyGroups(input.occupancyGroups);
    if (input.annualEmissionsTco2e != null) setEmissions(input.annualEmissionsTco2e);
    // isArticle321 stays a user toggle — never auto-set from extraction.
  }}
/>
```
(Adapt the setter names to the actual P0 form state. If P0 stored the building input as a single object, call its single setter with a `{ ...prev, ...input }` merge instead.)

3. - [ ] Build:
   `npm run build`
   Expected: build succeeds, no type errors.

4. - [ ] Visual QA. Serve the prod build (kill any stale server first — a leftover `next start` once served an old build and masked a redesign):
   `pkill -f "next start"; npm start`
   Then screenshot and READ the PNGs:
   `node /tmp/shots/shot.mjs http://localhost:3000 /tmp/shots/p3`
   Verify: the paste panel renders above the form; pasting the ESPM fixture text + clicking "Extract fields" pre-fills GFA / occupancy / emissions and shows the filled/missing strip with the "estimated (regex)" badge (no key in local dev) or "AI-extracted" (key set). `pkill -f "next start"` when done.

5. - [ ] Commit:
```
git add components/IngestPanel.tsx app/page.tsx
git commit -m "feat(ingest): paste panel pre-fills building form; shows filled-vs-null honesty + PDF note

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Agent-framing documentation (in this plan + a short README section)

Make the agent framing explicit and discoverable, so a judge reading the repo sees the composable-agents story with each step's input/output.

**Files**
- Modify: `README.md` (add an "Agentic ingestion (P3)" section)

**Steps**

1. - [ ] Append an "Agentic ingestion (P3)" section to `README.md` documenting the five composable agents and the boundary, with each step's input → output:

```
## Agentic ingestion (P3)

Paste a document → a chain of small, composable agents produces a compliance plan.
The LLM only extracts/structures, ranks, narrates, and cites — the deterministic engine owns every number.

1. ingest    — lib/ai/extract.extractBuildingInput(text)        : document text  -> Partial<BuildingInput>  (Claude, transcribe-only; regex fallback with no key)
2. structure — lib/ai/pipeline.structureBuilding(extracted, x)  : Partial + user overrides -> BuildingInput (pure)
3. compliance RAG — lib/ai/ask.answerLawQuestion(question)      : NL question -> {answer, citations}        (P1; optional "do I qualify?" step)
4. optimize  — lib/optimize/retrofit.optimizeRetrofit(input)    : fines + catalogs -> RetrofitPlan (MACC, schedule, TCO) (pure)
5. narrate   — lib/ai/advise.generateAdvice(facts, fines, …)    : computed plan -> explainer/board summary  (P1; prose only)

The engine (lib/ll97) computes fines from the structured BuildingInput between steps 2 and 4.
Endpoints: POST /api/ingest {text} -> Partial<BuildingInput>. PDF -> text is out of scope (paste the text;
a client-side pdf.js path keeps it dependency-light and offline-friendly).
```

2. - [ ] Sanity-run the full suite one more time:
   `npm test && npx tsc --noEmit`
   Expected: all tests green, no type errors.

3. - [ ] Commit:
```
git add README.md
git commit -m "docs(ingest): document the composable agent pipeline (ingest -> structure -> RAG -> optimize -> narrate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-check

**Every P3 spec item maps to a task:**
- Spec item 1 — `lib/ai/extract.ts` `extractBuildingInput(text): Promise<Partial<BuildingInput>>` extracting GFA, occupancy-group splits (ESPM names), and fuel/reported emissions from utility-bill / ESPM / audit text; LLM extract-only (never computes the fine); regex deterministic fallback when no key; tested with committed fixtures via injected/mocked client → **Tasks 1 + 2** (regex+fallback in Task 1; Claude structured-output path + mocked-client tests in Task 2; ESPM + utility-bill + audit fixtures committed; the public return is `ExtractionResult` whose `.input` is exactly `Partial<BuildingInput>`).
- Spec item 2 — `app/api/ingest/route.ts` POST `{text}` → `Partial<BuildingInput>` via `Response.json` → **Task 3** (returns `ExtractionResult` carrying `.input: Partial<BuildingInput>` + honesty metadata; `Response.json`, Next 16; 400 guards).
- Spec item 3 — UI upload/paste panel pre-fills the building input → existing P0/P1 pipeline; shows LLM-filled vs. null fields (honesty) → **Task 5** (`IngestPanel` + `app/page.tsx` wiring; filled/missing strip; feeds the unchanged lookup-or-manual → compute → optimize → narrate flow).
- Spec item 4 — agent framing: composable agents ingest → structure → compliance RAG → optimize → narrate with each step's input/output; optional `lib/ai/pipeline.ts` tying them, tested at the seam with mocks → **Tasks 4 + 6** (`pipeline.ts` with named step I/O + seam test mocking extract & engine; README agent-framing section enumerating all five steps' inputs/outputs).
- Spec item 5 — PDF note: extraction operates on TEXT; PDF→text out of scope; client-side pdf.js / paste-the-text keeps it dependency-light & offline → **Task 5** (panel copy) + **Task 6** (README note). No PDF dependency is added.

**No placeholders:** every code step contains complete, runnable code — real fixture text, the real extraction system prompt + JSON schema, the real regexes, the real route, the real pipeline, the real component, and real assertions. No "TBD", no "add error handling", no "similar to above".

**Types match the contract:** `BuildingInput`/`FineResult`/`computeAllPeriods` are imported from `@/lib/ll97/engine` (the locked P0 types) and never redefined; the route returns the extractor's result whose `.input` is `Partial<BuildingInput>` exactly as the index contract's `POST /api/ingest { text } -> Partial<BuildingInput>` row requires; `isArticle321` is treated as a user toggle (never extracted), consistent with the spec's Article-321 honesty design. The number-computation boundary is preserved: the only LLM call (`extractBuildingInput`) transcribes and never computes; `computeAllPeriods` produces every fine. SDK usage (`output_config.format` json_schema + `effort`, model `claude-opus-4-8`, `content.find(b => b.type === 'text')`) matches the verified pattern in `lib/ai/advise.ts` and the installed `@anthropic-ai/sdk@^0.100.1`. Mock pattern (`vi.resetModules()` → `vi.doMock('@anthropic-ai/sdk', …)` → dynamic import) matches `lib/ai/advise.test.ts`.
