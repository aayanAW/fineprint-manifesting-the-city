// FinePrint v2 LL97 engine — the single source of every number shown to users.
// Pure functions: same input, same output. No clocks, no network, no env.
// Money is handled in integer cents internally and exposed as USD at the
// boundary; emissions are tCO2e. Rounding happens only here: tCO2e to two
// decimals (matching DOB's published example), money to the cent.

import {
  ESPM_FACTORS_TCO2E_PER_SQFT,
  PENALTY_CENTS_PER_TCO2E,
  PERIODS,
  resolveEspmType,
  type Period,
} from './constants';

export type { Period };
export { PERIODS };

export interface BuildingInput {
  grossFloorAreaSqft: number;
  occupancyGroups: Array<{ group: string; sqft: number }>; // ESPM property-type names
  annualEmissionsTco2e: number;
  isArticle321?: boolean; // rent-regulated / affordable pathway
}

export interface FineResult {
  period: Period;
  emissionsLimitTco2e: number;
  actualEmissionsTco2e: number;
  overageTco2e: number; // 0 if compliant
  annualFineUsd: number; // 0 if compliant
  compliant: boolean;
  pathway: 'standard' | 'article321';
  notes: string[];
}

const ARTICLE_321_NOTE =
  'Article 321 building: complies through prescribed energy conservation ' +
  'measures (Admin Code §28-321.2.2) or by meeting its 2030 limit early ' +
  '(§28-321.2.1), not through the $268/tCO2e penalty. The limit shown is the ' +
  '2030 target. Flat $10,000 non-compliance penalties are not modeled.';

export function computeFine(building: BuildingInput, period: Period): FineResult {
  validateBuilding(building);
  validatePeriod(period);
  const notes: string[] = [];

  if (building.isArticle321) {
    const target = limitFor(building, '2030-2034');
    notes.push(ARTICLE_321_NOTE);
    return {
      period,
      emissionsLimitTco2e: round2(target),
      actualEmissionsTco2e: building.annualEmissionsTco2e,
      overageTco2e: 0,
      annualFineUsd: 0,
      compliant: true,
      pathway: 'article321',
      notes,
    };
  }

  const limit = limitFor(building, period);
  // Penalty per 1 RCNY §103-14(h): overage × $268. Computed at full precision,
  // rounded only here — money to the cent.
  const overage = Math.max(0, building.annualEmissionsTco2e - limit);
  const fineCents = Math.round(overage * PENALTY_CENTS_PER_TCO2E);

  return {
    period,
    emissionsLimitTco2e: round2(limit),
    actualEmissionsTco2e: building.annualEmissionsTco2e,
    overageTco2e: round2(overage),
    annualFineUsd: fineCents / 100,
    compliant: fineCents === 0,
    pathway: 'standard',
    notes,
  };
}

export function computeAllPeriods(building: BuildingInput): FineResult[] {
  return PERIODS.map(period => computeFine(building, period));
}

// limit = Σ over occupancy groups [ espmFactor(group, period) × sqft ].
function limitFor(building: BuildingInput, period: Period): number {
  return building.occupancyGroups.reduce((sum, space) => {
    const key = resolveEspmType(space.group);
    if (key === undefined) {
      throw new Error(
        `"${space.group}" is not a known ESPM property type. The data layer must ` +
          `map LL84 use names to ESPM vocabulary before calling the engine.`,
      );
    }
    return sum + ESPM_FACTORS_TCO2E_PER_SQFT[period][key] * space.sqft;
  }, 0);
}

function validateBuilding(building: BuildingInput): void {
  if (!Number.isFinite(building.grossFloorAreaSqft) || building.grossFloorAreaSqft < 0) {
    throw new Error(
      `gross floor area must be a non-negative number, got ${building.grossFloorAreaSqft}`,
    );
  }
  if (!Number.isFinite(building.annualEmissionsTco2e) || building.annualEmissionsTco2e < 0) {
    throw new Error(
      `annual emissions must be a non-negative number of tCO2e, got ${building.annualEmissionsTco2e}`,
    );
  }
  if (building.occupancyGroups.length === 0) {
    throw new Error('building needs at least one occupancy group to compute a limit');
  }
  let totalGroupSqft = 0;
  for (const space of building.occupancyGroups) {
    if (!Number.isFinite(space.sqft) || space.sqft < 0) {
      throw new Error(`occupancy group "${space.group}" has an invalid area of ${space.sqft} sqft`);
    }
    totalGroupSqft += space.sqft;
  }
  if (totalGroupSqft > building.grossFloorAreaSqft + 1e-6) {
    throw new Error(
      `occupancy group areas total ${totalGroupSqft} sqft, which exceeds the gross ` +
        `floor area of ${building.grossFloorAreaSqft} sqft`,
    );
  }
}

function validatePeriod(period: Period): void {
  if (!PERIODS.includes(period)) {
    throw new Error(`"${period}" is not a known period; valid: ${PERIODS.join(', ')}`);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
