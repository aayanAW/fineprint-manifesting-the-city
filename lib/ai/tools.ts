// FinePrint v2 — Anthropic tool-use definitions for the data/engine layer.
//
// An agent worker passes `dataToolDefinitions` to the Messages API and routes each
// tool_use block through `executeDataTool`. THE ONE RULE holds at the tool boundary:
// the model NEVER computes a number. `assess_building` calls lookupBuilding (public
// datasets) and computeAllPeriods (the verified fine engine) and returns those engine
// numbers; the model only decides when to call the tool and how to narrate the result.
//
// Remade from the aaravmin tool layer (/tmp/aaravmin-fineprint/data/src/tools.ts),
// adapted to the v2 module layout: BuildingFacts → engine BuildingInput conversion is
// inlined here (this repo has no separate engineBridge), and the lookup is injectable
// so tests run fully offline.

import { computeAllPeriods, type BuildingInput, type FineResult } from '@/lib/ll97/engine';
import { lookupBuilding as realLookupBuilding } from '@/lib/data/lookup';
import type { BuildingFacts } from '@/lib/data/types';

export interface DataToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

const addressInput = {
  type: 'object' as const,
  properties: {
    address: {
      type: 'string',
      description: 'Street address with borough, e.g. "350 5th Avenue, Manhattan"',
    },
  },
  required: ['address'],
};

export const dataToolDefinitions: DataToolDefinition[] = [
  {
    name: 'lookup_building',
    description:
      'Look up a NYC building across public datasets: BBL, floor area, use splits, ' +
      'reported emissions, LL97 coverage, and Article 321 status, with the source of ' +
      'every field. Call this when you need building facts.',
    input_schema: addressInput,
  },
  {
    name: 'assess_building',
    description:
      'Full LL97 exposure assessment for a NYC building: the facts plus exact fine ' +
      'projections for 2024-2029, 2030-2034, and 2035-2039 computed by the fine engine. ' +
      'Call this when the question is about penalties, compliance, or dollars. The model ' +
      'must NOT compute these numbers itself — they come from the engine.',
    input_schema: addressInput,
  },
];

export interface DataToolDependencies {
  lookupBuilding?: (address: string) => Promise<BuildingFacts>;
}

/**
 * Route a tool_use call to its handler and return a JSON string (Messages API tool_result
 * content). `deps.lookupBuilding` is injectable so tests never hit the network.
 */
export async function executeDataTool(
  name: string,
  input: { address: string },
  deps: DataToolDependencies = {},
): Promise<string> {
  const lookup = deps.lookupBuilding ?? realLookupBuilding;

  if (name === 'lookup_building') {
    return JSON.stringify(await lookup(input.address));
  }

  if (name === 'assess_building') {
    return JSON.stringify(assessBuilding(await lookup(input.address)));
  }

  const valid = dataToolDefinitions.map(t => t.name).join(', ');
  throw new Error(`"${name}" is not a data tool; valid tools are ${valid}`);
}

export interface Assessment {
  facts: BuildingFacts;
  // Engine fine projections for all periods, or null when the city lacks the facts
  // the engine needs (then `note` explains which).
  projections: FineResult[] | null;
  note: string | null;
}

/** The single BuildingFacts → engine BuildingInput conversion point for this layer. */
function toEngineInput(facts: BuildingFacts): { input: BuildingInput | null; missing: string[] } {
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

function assessBuilding(facts: BuildingFacts): Assessment {
  const { input, missing } = toEngineInput(facts);
  if (!input) {
    return {
      facts,
      projections: null,
      note:
        `Fine projections unavailable: the city has no ${missing.join(', ')} for this ` +
        'building (usually a missing LL84 filing — emissions and use splits are unknown). ' +
        'The facts above are still sourced.',
    };
  }
  return { facts, projections: computeAllPeriods(input), note: null };
}
