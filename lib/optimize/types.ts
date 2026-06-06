// Optimizer types — LOCKED INTERFACE CONTRACT. The deterministic engine
// (lib/optimize/retrofit.ts, P1) produces these; the UI only renders them.

import type { FineResult, Period } from "@/lib/ll97/engine";
import type {
  Measure,
  RebateProgram,
  MatchedRebate,
} from "@/data/catalogs/types";

export interface MaccPoint {
  measureKey: string;
  name: string;
  tCO2eReduced: number;
  netCostUSD: number | null;
  costPerTonUSD: number | null;
}

export interface ScheduledMeasure {
  measureKey: string;
  name: string;
  doByYear: number;
}

export interface RetrofitPlan {
  chosenMeasureKeys: string[];
  capexUSD: number;
  totalFinesAvoidedUSD: number; // through 2050, vs do-nothing
  tcoUSD: number; // capex + residual fines-to-2050
  residualEmissionsTco2e: number; // 2030-2034 basis
  macc: MaccPoint[]; // sorted ascending by costPerTonUSD
  schedule: ScheduledMeasure[];
  range: { tcoLowUSD: number; tcoHighUSD: number };
  matchedRebatesByMeasure: Record<string, MatchedRebate[]>;
}

export interface OptimizeInput {
  fines: FineResult[];
  fuels: string[]; // 'gas'|'oil'|'steam'|'electric'
  units: number | null;
  isMultifamily: boolean;
  affordable: boolean;
  targetPeriod?: Period; // default '2030-2034'
}

export type { Measure, RebateProgram, MatchedRebate };
