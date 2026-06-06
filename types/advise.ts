export interface Measure {
  key: string;                 // 'heat-pump' | 'heat-pump-water-heater' | 'lighting' | 'envelope' | 'controls' | 'solar-pv' | 'weatherization'
  name: string;
  appliesToFuel: string[];     // 'gas' | 'oil' | 'steam' | 'electric' | 'any'
  emissionsReductionPctLow: number;
  emissionsReductionPctHigh: number;
  typicalCostPerUnitUSDMax: number | null;  // rough $ per dwelling unit
  typicalCostNote: string;
  url: string;
}

export interface RebateProgram {
  name: string;
  administrator: string;
  measures: string[];          // measure keys it funds
  appliesToMultifamily: boolean;
  incomeEligibleBonus: boolean;
  amount: string;              // human-readable
  amountNumericMaxUSD: number | null;
  status: string;              // 'active' | 'expiring' | 'expired'
  sunsetDate: string | null;
  url: string;
  // Explicit eligibility flags (replace brittle prose-regex gating in roi.ts).
  // Defaults when omitted: cashEligible=true, asOfRight=true, incomeRestricted=false.
  incomeRestricted?: boolean;  // true => only valid for affordable/rent-regulated buildings
  cashEligible?: boolean;      // false => a tax deduction/credit or advisory; never drives net-cost math
  asOfRight?: boolean;         // false => competitive/demonstration grant, not an entitlement; informational only
}

export interface MatchedRebate { name: string; amount: string; amountShort: string; url: string; }

export interface FixCandidate {
  measureKey: string;
  measure: string;             // display name
  tCO2eReduced: number;        // current period, code-computed
  grossCostUSD: number | null;
  matchedRebates: MatchedRebate[];
  netCostUSD: number | null;
  paybackYears: number | null;
  fineAvoidedUSD: number;      // annual, code-computed
  rationale?: string;          // filled by Claude (prose only)
}

export interface AdvicePlan {
  explainer: string;
  boardSummary: string;
  rankedFixes: FixCandidate[];
  source: 'ai' | 'fallback';
  planPeriod?: string;          // compliance period the plan economics are computed for (e.g. '2030-2034')
  planPeriodFineUSD?: number;   // annual fine in that period — what each fix's payback is measured against
}
