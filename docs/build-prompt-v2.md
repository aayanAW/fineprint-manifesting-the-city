# Claude Code build prompt — FinePrint v2 (maximum-impact version)

> This is the authoritative concept brief for this repo. Target event: **"Manifesting a Better City: AI × Sustainability"** (#NYTechWeek), judged by academics. Engine carried over from the original FinePrint (verified LL97 calc, 67 passing tests). See `docs/hackathon-rules.md` for judging criteria.

---

We're leveling up **FinePrint**, an AI compliance copilot for NYC's **Local Law 97** (building carbon-emissions law), into the "maximum-impact" version for an AI × Sustainability hackathon judged by academics. A basic prototype exists that does simple LL97 lookups. Your job is to evolve it into the full vision below.

## Do this first (don't write code yet)
1. Read the strategy doc in this repo (if present).
2. Review the existing codebase. Tell me in a few bullets: what's already built, the stack/structure, and what's reusable vs. needs rework. **Respect the existing stack** unless it blocks the plan — flag it if so.
3. Propose a short build plan + file structure that hits the milestones below. **Build the deterministic core first and verify it before adding any AI or expansions.** Then proceed milestone by milestone, pausing after P0 so I can check the numbers.

## The problem (context)
Buildings are ~⅔ of NYC's emissions. LL97 fines covered buildings (>25,000 sf, ~50,000 of them) **$268 per ton CO₂e over an annual limit**. Compliance Period 1 (2024–2029) is lenient; **Period 2 (2030–2034) is a cliff — ~57% of buildings are projected to exceed it.** Most owners don't know their number or their cheapest fix. FinePrint tells them, free, in seconds — and scales the same analysis to a portfolio or the whole city.

## User flow
Enter a building (address or BBL) → pull its real public energy data → compute its LL97 limit and penalty for each compliance period → show the 2030 "cliff" → explain why in plain English → generate the cost-optimal retrofit plan to drive the fine to $0 → answer "fine print" questions about the law with citations → zoom out to portfolio / city-wide impact.

## The math — exact, deterministic, and OUT of the LLM
Put this in its own well-tested module. The LLM must never produce the penalty number.
- **Emissions limit** (tCO₂e/yr) = Σ over occupancy groups [ `coefficient(group, period)` × `gross_floor_area` ]. Coefficients differ per compliance period and are published in the DOB rules — hardcode them in a config file with the source URL in a comment:
  - https://rules.cityofnewyork.us/rule/calculation-of-emission-limits-for-buildings/
  - https://rules.cityofnewyork.us/rule/annual-greenhouse-gas-ghg-emissions-limits-for-buildings/
- **Building emissions**: prefer the reported *Total GHG Emissions (Metric Tons CO₂e)* from the LL84 dataset; if absent, compute Σ over fuels [ `consumption` × `fuel_coefficient` ] (electricity, natural gas, #2/#4 fuel oil, district steam).
- **Penalty** (per year) = `268 × max(0, emissions − limit)`.
- **Periods**: CP1 = 2024–2029, CP2 = 2030–2034 (much stricter), trajectory to net-zero by 2050.
- **Verify**: unit-test against 2–3 buildings whose numbers you compute by hand. Show me the comparison.

## Data
- **Primary** — NYC Open Data LL84 Energy & Water Disclosure, dataset `5zyy-y8am`. Socrata JSON API: `https://data.cityofnewyork.us/resource/5zyy-y8am.json` (supports `$where`, `$limit`, `$select`). Fields include BBL, address, primary property type, GFA, reported GHG emissions, EUI. **Download once and cache locally as parquet** — don't hit the API on every request.
- **Join** — PLUTO (property attributes, year built, owner), and the LL97/LL84 covered-buildings list.
- Build a `property_type → LL97 occupancy group → coefficient` mapping table.

## Milestones (build and verify in this order)

**P0 — Deterministic core (do first, then pause for my review).**
- Data loader + local cache; address/BBL resolver.
- `limit(building, period)`, `emissions(building)`, `penalty(building, year)`.
- Minimal UI: search box → result card showing emissions vs. CP1 limit vs. CP2 limit, with the penalty for each. Make the **2030 cliff** unmissable (color + the number going red). One bar chart with two limit lines.
- Unit tests confirming the hand-checked buildings.

**P1 — AI layer + optimization.**
- *Explanation generator*: feed the computed numbers to Claude → 2–3 sentence plain-English "why you're over / under."
- *Fine-print RAG*: index LL97 + Article 320/321 + key DOB rule text; answer compliance questions **with citations** to the source. Must handle "Do I qualify for the affordable-housing pathway?" and "What's a good-faith effort?"
- *Retrofit optimizer* (technical-depth centerpiece): minimize **total cost of ownership = capex + Σ projected annual fines through 2050 + energy cost**, subject to meeting each period's limit you choose to comply with. Output (a) a per-building **marginal abatement cost curve** and (b) an **optimal retrofit schedule over time** (what to do now vs. before 2030). Use PuLP or OR-Tools (MILP), or a clearly documented greedy/DP. Show uncertainty ranges, not false precision. The LLM *narrates* the optimizer's output; it does not invent it.

**P2 — Scale + money + equity.**
- *City-scale view*: run the engine across all covered buildings → aggregate tons over the 2030 limit, total $ fine exposure, and the cheapest citywide path to the 40%-by-2030 goal. Render a **neighborhood heatmap** (Leaflet/Mapbox) of fine exposure. Support a portfolio view (filter by owner/BBL list).
- *Financing matcher*: map each recommended measure to real funding — NYSERDA, Con Ed rebates, IRA §179D & 48 ITC, C-PACE, NYC AHRF/REDi (affordable housing) — and show net cost + payback.
- *Equity overlay*: overlay environmental-justice / disadvantaged-community data; auto-flag Article 321 eligibility and AHRF for qualifying buildings.

**P3 — Agentic ingestion (if time).**
- Upload a utility bill / ENERGY STAR Portfolio Manager export / audit PDF → an LLM extraction step fills the structured inputs the formula needs. Frame the whole pipeline as small agents: ingest → structure → compliance RAG → optimize → narrate.

## AI guidance
- Use the Anthropic Claude API. Keep a clean boundary: deterministic math in one module, LLM for language/reasoning/extraction only.
- **Cache LLM responses for the demo buildings** so nothing hangs on venue wifi.

## The demo this must support (make it robust)
- Fast, reliable single-building lookup; **pre-cache 3 buildings** including one affordable-housing building.
- The 2030 cliff visual.
- The city-scale heatmap ("we ran it on every covered building in NYC").
- Fine-print Q&A with visible citations.
- Cache the LL84 data and LLM calls locally so the full demo works even if the network is flaky.

## Scope guardrails
- No auth, no user accounts. Local parquet/SQLite only — no heavy database.
- One repo. The penalty math module is independent and fully unit-tested.
- LL97 only. **Do not** add LL84/LL88/LL95 as separate features — depth over breadth.
- The LLM never produces the fine; it explains and plans around the deterministic numbers.

## Suggested stack (if greenfield; otherwise match what exists)
- Frontend: React + Vite, Recharts (charts), Leaflet or Mapbox GL (map).
- Backend: Python + FastAPI; pandas for data; PuLP or OR-Tools for the optimizer; Anthropic SDK for Claude.
- Local cache of the LL84 dataset (parquet) + cached LLM responses.

## Definition of done
- Penalty output matches a hand calculation for the known test buildings.
- City-wide aggregate passes a sanity check (order-of-magnitude reasonable vs. the ~50k buildings / 2030 projections).
- The full demo flow runs end-to-end from cache without live network.
