// AI-layer types — LOCKED INTERFACE CONTRACT. Claude only ranks/explains/
// narrates/cites over engine output; every number in these shapes was
// computed by code.

import type { MatchedRebate } from "@/data/catalogs/types";

export interface FixCandidate {
  measureKey: string;
  measure: string;
  tCO2eReduced: number;
  grossCostUSD: number | null;
  matchedRebates: MatchedRebate[];
  netCostUSD: number | null;
  paybackYears: number | null;
  fineAvoidedUSD: number;
  rationale?: string;
}

export interface AdvicePlan {
  explainer: string;
  boardSummary: string;
  rankedFixes: FixCandidate[];
  source: "ai" | "fallback";
  planPeriod?: string;
  planPeriodFineUSD?: number;
}

export interface Citation {
  source: string;
  url: string;
  quote: string;
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
}
