// Mock data layer — frontend-first development. Shapes are the LOCKED
// INTERFACE CONTRACT, so wiring the real backend later is a one-import swap
// (lib/mock → lib/data lookup + lib/optimize engine + lib/ai).
//
// The one rule holds even here: every fine below is computed by the REAL
// remade LL97 engine (lib/ll97/engine.ts) at module load — only facts,
// retrofit economics, and prose are mocked, each labeled as such.

import { computeAllPeriods, type FineResult } from "@/lib/ll97/engine";
import type { BuildingFacts } from "@/lib/data/types";
import type { RetrofitPlan } from "@/lib/optimize/types";
import type { AdvicePlan, RagAnswer } from "@/lib/ai/types";

export interface DemoBuilding {
  slug: string;
  facts: BuildingFacts;
  fines: FineResult[];
}

// ——— 1. Empire State Building — the 2030 cliff, at scale ———————————————

const esbFacts: BuildingFacts = {
  bbl: "1008350041",
  address: "350 5th Avenue, Manhattan",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [
    { group: "Office", sqft: 2_692_475.1 },
    { group: "Social/Meeting Hall", sqft: 56_815 },
    { group: "Retail Store", sqft: 102_966.9 },
  ],
  annualEmissionsTco2e: 12_090.04,
  isLl97Covered: true,
  isArticle321: false,
  provenance: [
    { field: "bbl", source: "NYC GeoSearch" },
    {
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail:
        "2024 filing, recomputed from fuel use with Admin Code §28-320.3.1.1 coefficients",
    },
    {
      field: "grossFloorAreaSqft",
      source: "LL84 benchmarking disclosure",
      detail: "2024 filing",
    },
    {
      field: "isLl97Covered",
      source: "DOB Covered Buildings List, Filing Year 2026",
      detail: "annual reference snapshot; DOB refreshes it each filing year",
    },
  ],
};

// ——— 2. 1 Centre Street — already over the cap today ———————————————————

const centreFacts: BuildingFacts = {
  bbl: "1001210001",
  address: "1 Centre Street, Manhattan",
  grossFloorAreaSqft: 1_082_654,
  occupancyGroups: [{ group: "Office", sqft: 1_082_654 }],
  annualEmissionsTco2e: 9_200.1,
  isLl97Covered: true,
  isArticle321: false,
  provenance: [
    { field: "bbl", source: "NYC GeoSearch" },
    {
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail:
        "2024 filing, recomputed from fuel use with Admin Code §28-320.3.1.1 coefficients",
    },
    {
      field: "isLl97Covered",
      source: "DOB Covered Buildings List, Filing Year 2026",
    },
  ],
};

// ——— 3. 880 Boynton Avenue — affordable housing, Article 321 pathway ———

const boyntonFacts: BuildingFacts = {
  bbl: "2037650015",
  address: "880 Boynton Avenue, Bronx",
  grossFloorAreaSqft: 85_000,
  occupancyGroups: [{ group: "Multifamily Housing", sqft: 85_000 }],
  annualEmissionsTco2e: 391.2,
  isLl97Covered: true,
  isArticle321: true,
  provenance: [
    { field: "bbl", source: "NYC GeoSearch" },
    {
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: "2023 filing, location-based GHG as reported",
    },
    {
      field: "isArticle321",
      source: "DOB Covered Buildings List, Filing Year 2026",
      detail:
        "compliance pathway 3 (rent-regulated); eligibility cannot be proven from public data alone",
    },
  ],
};

function toFines(facts: BuildingFacts): FineResult[] {
  return computeAllPeriods({
    grossFloorAreaSqft: facts.grossFloorAreaSqft ?? 0,
    occupancyGroups: facts.occupancyGroups,
    annualEmissionsTco2e: facts.annualEmissionsTco2e ?? 0,
    isArticle321: facts.isArticle321 ?? false,
  });
}

export const DEMO_BUILDINGS: DemoBuilding[] = [
  { slug: "350-5th-avenue", facts: esbFacts, fines: toFines(esbFacts) },
  { slug: "1-centre-street", facts: centreFacts, fines: toFines(centreFacts) },
  {
    slug: "880-boynton-avenue",
    facts: boyntonFacts,
    fines: toFines(boyntonFacts),
  },
];

export function findDemoBuilding(query: string): DemoBuilding | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    DEMO_BUILDINGS.find(
      (b) =>
        b.facts.address.toLowerCase().includes(q) ||
        b.facts.bbl === q ||
        b.slug.includes(q.replace(/\s+/g, "-")),
    ) ?? null
  );
}

// ——— Retrofit plan (MOCK — real exact-enumeration optimizer lands in P1) ———

export const MOCK_RETROFIT_PLAN: RetrofitPlan = {
  chosenMeasureKeys: [
    "steam-traps",
    "led-lighting",
    "bms-controls",
    "heat-pumps",
  ],
  capexUSD: 41_800_000,
  totalFinesAvoidedUSD: 23_100_000,
  tcoUSD: 48_400_000,
  residualEmissionsTco2e: 7_412,
  macc: [
    {
      measureKey: "steam-traps",
      name: "Steam-trap survey & repair",
      tCO2eReduced: 484,
      netCostUSD: -58_000,
      costPerTonUSD: -120,
    },
    {
      measureKey: "led-lighting",
      name: "LED lighting retrofit",
      tCO2eReduced: 605,
      netCostUSD: -51_400,
      costPerTonUSD: -85,
    },
    {
      measureKey: "bms-controls",
      name: "BMS recommissioning & controls",
      tCO2eReduced: 726,
      netCostUSD: -29_000,
      costPerTonUSD: -40,
    },
    {
      measureKey: "dhw-electrify",
      name: "Electrify domestic hot water",
      tCO2eReduced: 363,
      netCostUSD: 34_500,
      costPerTonUSD: 95,
    },
    {
      measureKey: "heat-pumps",
      name: "Heat-pump conversion (heating)",
      tCO2eReduced: 2_863,
      netCostUSD: 601_000,
      costPerTonUSD: 210,
    },
    {
      measureKey: "envelope",
      name: "Envelope: air-sealing & insulation",
      tCO2eReduced: 484,
      netCostUSD: 165_000,
      costPerTonUSD: 340,
    },
    {
      measureKey: "solar-pv",
      name: "Rooftop solar PV",
      tCO2eReduced: 121,
      netCostUSD: 49_600,
      costPerTonUSD: 410,
    },
  ],
  schedule: [
    {
      measureKey: "steam-traps",
      name: "Steam-trap survey & repair",
      doByYear: 2026,
    },
    {
      measureKey: "led-lighting",
      name: "LED lighting retrofit",
      doByYear: 2027,
    },
    {
      measureKey: "bms-controls",
      name: "BMS recommissioning & controls",
      doByYear: 2027,
    },
    {
      measureKey: "heat-pumps",
      name: "Heat-pump conversion (heating)",
      doByYear: 2029,
    },
  ],
  range: { tcoLowUSD: 44_100_000, tcoHighUSD: 53_800_000 },
  matchedRebatesByMeasure: {
    "heat-pumps": [
      {
        name: "NYSERDA Clean Heat",
        amount: "up to $3,000/unit installed",
        amountShort: "$3k/unit",
        url: "https://cleanheat.ny.gov",
      },
      {
        name: "IRA §48 ITC",
        amount: "30% investment tax credit",
        amountShort: "30% ITC",
        url: "https://www.irs.gov/credits-deductions/businesses/energy-investment-tax-credit",
      },
    ],
    "led-lighting": [
      {
        name: "Con Edison C&I Energy Efficiency",
        amount: "up to $0.16/kWh saved",
        amountShort: "$0.16/kWh",
        url: "https://www.coned.com/en/save-money/rebates-incentives-tax-credits",
      },
    ],
    "bms-controls": [
      {
        name: "NYSERDA RTEM",
        amount: "30% of contract cost",
        amountShort: "30%",
        url: "https://www.nyserda.ny.gov/All-Programs/Real-Time-Energy-Management",
      },
    ],
  },
};

// ——— Advice (MOCK prose — Claude narration lands in P1; numbers from plan) ———

export const MOCK_ADVICE: AdvicePlan = {
  explainer:
    "This building clears its 2024–2029 cap, but the 2030 limit drops by nearly two-thirds: the same emissions that are legal today become a seven-figure annual penalty in 2030. Four measures, sequenced before the cliff, cut the projected fine to zero: the first three pay for themselves through energy savings, and the heat-pump conversion does the heavy lifting on tonnage.",
  boardSummary:
    "Do nothing: ≈$1.18M/yr in LL97 penalties from 2030. Recommended: 4-measure retrofit, ≈$41.8M gross / lower after incentives, eliminating the penalty and cutting energy spend. Cheapest three measures are cash-positive immediately.",
  rankedFixes: [],
  source: "fallback",
  planPeriod: "2030-2034",
};

// ——— Ask-the-law (MOCK — BM25 RAG with citations lands in P1) ———————————

export const MOCK_ASK_SEEDS: Array<{ question: string; answer: RagAnswer }> = [
  {
    question: "Do I qualify for the affordable-housing pathway?",
    answer: {
      answer:
        "Possibly. Article 321 covers buildings with at least one rent-regulated unit, HDFC co-ops, and project-based federal housing. Instead of the $268/ton penalty, these buildings comply by completing a prescribed list of energy-conservation measures by 2024, or by meeting their 2030 emissions limit early. Note: eligibility cannot be confirmed from public data alone; it depends on your unit regulation status.",
      citations: [
        {
          source: "NYC Admin Code §28-321.2",
          url: "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-129975",
          quote:
            "The owner of a covered building that contains one or more dwelling units required by law to be rent regulated shall comply with either section 28-321.2.1 or 28-321.2.2…",
        },
      ],
    },
  },
  {
    question: "What counts as a good-faith effort?",
    answer: {
      answer:
        "DOB may grant penalty mitigation when an owner demonstrates good-faith efforts: filing the required reports, having a decarbonization plan approved, showing work under permit toward compliance, or documented financial hardship. It reduces or defers the penalty; it does not erase the underlying limit.",
      citations: [
        {
          source: "1 RCNY §103-14(i) — Mitigated penalties",
          url: "https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf",
          quote:
            "In determining the amount of the civil penalty… the department shall consider whether the owner has made a good faith effort to comply, including the timely filing of a decarbonization plan…",
        },
      ],
    },
  },
  {
    question: "Can I buy renewable energy credits instead of retrofitting?",
    answer: {
      answer:
        "Partially. RECs may offset only the emissions attributable to electricity consumption, must be generated in or deliverable into NYC (Zone J), and must be purchased for the reporting year. Emissions from on-site fossil combustion (gas, oil, steam) cannot be offset with RECs, which is why heating electrification dominates most compliance plans.",
      citations: [
        {
          source: "NYC Admin Code §28-320.3.6",
          url: "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-129942",
          quote:
            "A deduction from reported annual building emissions may be authorized… for the purchase of renewable energy credits… solely to the extent of emissions attributed to electricity consumption.",
        },
      ],
    },
  },
];

// ——— Citywide (MOCK aggregate — scripts/precompute-city.ts lands in P2) ———

export const MOCK_CITY = {
  coveredBuildings: 29_173,
  overLimit2030: 11_624,
  shareOver2030: 0.398,
  totalExposureUsd2030: 1_142_000_000,
  totalOverageTco2e2030: 4_261_000,
  note: "Mock aggregate, order-of-magnitude calibrated to DOB Covered Buildings List (29,173 BBLs) and published 2030 projections. Real precompute (engine over every covered BBL) lands in P2.",
  worstOffenders: [
    {
      rank: 1,
      address: "345 Park Avenue",
      borough: "Manhattan",
      use: "Office",
      fine2030: 2_410_000,
    },
    {
      rank: 2,
      address: "1 Penn Plaza",
      borough: "Manhattan",
      use: "Office",
      fine2030: 2_150_000,
    },
    {
      rank: 3,
      address: "200 West Street",
      borough: "Manhattan",
      use: "Office",
      fine2030: 1_890_000,
    },
    {
      rank: 4,
      address: "350 5th Avenue",
      borough: "Manhattan",
      use: "Office",
      fine2030: 1_182_000,
    },
    {
      rank: 5,
      address: "55 Water Street",
      borough: "Manhattan",
      use: "Office",
      fine2030: 1_010_000,
    },
    {
      rank: 6,
      address: "1211 6th Avenue",
      borough: "Manhattan",
      use: "Office",
      fine2030: 968_000,
    },
    {
      rank: 7,
      address: "Methodist Hospital Pavilion",
      borough: "Brooklyn",
      use: "Hospital",
      fine2030: 901_000,
    },
    {
      rank: 8,
      address: "5 Times Square",
      borough: "Manhattan",
      use: "Office",
      fine2030: 845_000,
    },
  ],
  boroughs: [
    {
      name: "Manhattan",
      covered: 12_481,
      over2030: 5_612,
      exposure: 692_000_000,
    },
    {
      name: "Brooklyn",
      covered: 7_904,
      over2030: 2_870,
      exposure: 201_000_000,
    },
    { name: "Queens", covered: 5_217, over2030: 1_944, exposure: 142_000_000 },
    { name: "Bronx", covered: 2_886, over2030: 1_021, exposure: 86_000_000 },
    {
      name: "Staten Island",
      covered: 685,
      over2030: 177,
      exposure: 21_000_000,
    },
  ],
};
