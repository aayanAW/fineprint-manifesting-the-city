// Public types for the FinePrint data layer — LOCKED INTERFACE CONTRACT.
// Every fact carries provenance: which dataset said it, so the UI renders an
// honest footnote. Fields the city has no answer for are null, never guessed.

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
