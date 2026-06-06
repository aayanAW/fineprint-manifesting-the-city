// Bridges the data layer's BuildingFacts to the engine/optimizer inputs.
// The single conversion point used by every API route.

import { computeAllPeriods, type BuildingInput, type FineResult } from '@/lib/ll97/engine';
import type { BuildingFacts } from '@/lib/data/types';
import type { RoiContext } from '@/lib/advise/roi';

const AVG_UNIT_SQFT = 900; // rough NYC apartment size, for the unit-count estimate

/** BuildingFacts → engine BuildingInput. Returns nulls the city never supplied. */
export function toEngineInput(facts: BuildingFacts): { input: BuildingInput | null; missing: string[] } {
  const missing: string[] = [];
  if (facts.grossFloorAreaSqft === null) missing.push('grossFloorAreaSqft');
  if (facts.occupancyGroups.length === 0) missing.push('occupancyGroups');
  if (facts.annualEmissionsTco2e === null) missing.push('annualEmissionsTco2e');
  if (missing.length > 0) return { input: null, missing };
  return {
    input: {
      grossFloorAreaSqft: facts.grossFloorAreaSqft!,
      occupancyGroups: facts.occupancyGroups,
      annualEmissionsTco2e: facts.annualEmissionsTco2e!,
      isArticle321: facts.isArticle321 ?? false,
    },
    missing: [],
  };
}

/** All-period fines for a building, or null when the city lacks the inputs. */
export function computeFines(facts: BuildingFacts): FineResult[] | null {
  const { input } = toEngineInput(facts);
  return input ? computeAllPeriods(input) : null;
}

/** Derive the ROI/optimizer context. Fuels aren't in BuildingFacts, so callers
 *  may pass them; default to considering all fuels so every measure is evaluated. */
export function deriveContext(
  facts: BuildingFacts,
  opts?: { fuels?: string[]; affordable?: boolean },
): RoiContext {
  const gfa = facts.grossFloorAreaSqft;
  const units = gfa != null && gfa > 0 ? Math.max(1, Math.round(gfa / AVG_UNIT_SQFT)) : null;
  const isMultifamily = facts.occupancyGroups.some(u => u.group.toLowerCase().includes('multifamily'));
  const fuels = opts?.fuels ?? ['gas', 'electric', 'oil', 'steam'];
  const affordable = opts?.affordable ?? facts.isArticle321 ?? false;
  return { units, gfa, isMultifamily, affordable, fuels };
}
