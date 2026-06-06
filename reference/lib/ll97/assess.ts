import { PERIODS, Period } from './coefficients';
import { computeEmissions } from './emissions';
import { computeLimit, factorFor } from './limit';
import { computeFine } from './fine';
import type { AssessmentInput, BuildingAssessment } from '@/types/assessment';

/**
 * Assemble a full assessment across all compliance periods.
 * Emissions method: recompute from fuel use when any fuel field is present ('fuel');
 * otherwise fall back to the benchmarking-reported GHG ('reported', eGRID basis).
 */
export function buildAssessment(input: AssessmentInput): BuildingAssessment {
  const e = input.energy;
  const hasFuel = e.electricity_kWh != null || e.naturalGas_therms != null ||
    e.fuelOil2_kBtu != null || e.fuelOil4_kBtu != null || e.districtSteam_kBtu != null;
  const method: 'fuel' | 'reported' = hasFuel ? 'fuel' : 'reported';

  const byPeriod = {} as Record<Period, number>;
  const limits = {} as Record<Period, number>;
  const fines = {} as Record<Period, ReturnType<typeof computeFine>>;
  for (const p of PERIODS) {
    const emissions = method === 'fuel' ? computeEmissions(e, p) : (e.reportedGHG_tCO2e ?? 0);
    byPeriod[p] = emissions;
    limits[p] = computeLimit(input.building.useTypes, p);
    fines[p] = computeFine(emissions, limits[p]);
  }

  const gfa = input.building.gfa;
  const flags = new Set<string>(input.flags ?? []);
  if (method === 'reported') flags.add('reported-ghg-egrid-basis');
  if (!(gfa > 0)) flags.add('missing-gfa');                         // 0, NaN, or negative -> missing data
  // Only "mixed-use" when there is more than one DISTINCT space type — residual back-fill can
  // duplicate the same type (e.g. Office + Office), which is not genuinely mixed-use.
  const distinctTypes = new Set(input.building.useTypes.map(u => u.type.trim().toLowerCase()));
  if (distinctTypes.size > 1) flags.add('mixed-use-estimate');
  // A type with GFA that fails to resolve in ANY period contributes 0 silently -> flag it loudly.
  const unresolved = new Set<string>();
  for (const p of PERIODS)
    for (const u of input.building.useTypes)
      if (u.gfa > 0 && factorFor(u.type, p) === undefined) unresolved.add(u.type);
  if (unresolved.size > 0) flags.add('unmapped-property-type');
  if (limits['2024-2029'] === 0 && gfa > 0) flags.add('limit-unavailable');

  return {
    building: input.building, energy: e,
    emissions: { method, byPeriod }, limits, fines,
    covered: gfa > 25000,
    pathway: 'article320',
    flags: [...flags],
  };
}
