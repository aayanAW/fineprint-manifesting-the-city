// Catalog types — LOCKED INTERFACE CONTRACT
// (docs/superpowers/plans/2026-06-06-fineprint-v2-implementation-index.md).
// Do not rename fields.

export interface Measure {
  key: string;
  name: string;
  appliesToFuel: string[];
  emissionsReductionPctLow: number;
  emissionsReductionPctHigh: number;
  typicalCostPerUnitUSDMax: number | null;
  typicalCostNote: string;
  url: string;
}

export interface RebateProgram {
  name: string;
  administrator: string;
  measures: string[];
  appliesToMultifamily: boolean;
  incomeEligibleBonus: boolean;
  amount: string;
  amountNumericMaxUSD: number | null;
  status: string;
  sunsetDate: string | null;
  url: string;
  incomeRestricted?: boolean;
  cashEligible?: boolean;
  asOfRight?: boolean;
}

export interface MatchedRebate {
  name: string;
  amount: string;
  amountShort: string;
  url: string;
}
