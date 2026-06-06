// Recompute building emissions from fuel consumption using the statute's
// coefficients (1 RCNY §103-14 / Admin Code §28-320.3.1.1) — the basis DOB's
// penalty math uses, as opposed to ESPM's eGRID-based reported figure.

import { FUEL_COEFFICIENTS, type Period } from './constants';

export interface FuelUse {
  electricity_kWh?: number;
  naturalGas_kBtu?: number;
  fuelOil2_kBtu?: number;
  fuelOil4_kBtu?: number;
  districtSteam_kBtu?: number;
}

/**
 * Sum fuel × period coefficient → tCO2e. Returns full precision (round only at
 * the fine boundary). `tco2e` is null when no fuel data was supplied at all.
 * Every fuel here has a verified coefficient, so `unpriceableFuels` is empty;
 * it exists so the data layer can flag fuels it could not map.
 */
export function recomputeEmissions(
  fuel: FuelUse,
  period: Period,
): { tco2e: number | null; unpriceableFuels: string[] } {
  const c = FUEL_COEFFICIENTS[period];
  const parts: Array<[keyof FuelUse, number]> = [
    ['electricity_kWh', c.electricity_kWh],
    ['naturalGas_kBtu', c.naturalGas_kBtu],
    ['fuelOil2_kBtu', c.fuelOil2_kBtu],
    ['fuelOil4_kBtu', c.fuelOil4_kBtu],
    ['districtSteam_kBtu', c.districtSteam_kBtu],
  ];

  let sum = 0;
  let any = false;
  for (const [key, coef] of parts) {
    const v = fuel[key];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`fuel "${key}" must be a non-negative number, got ${v}`);
    }
    sum += v * coef;
    any = true;
  }

  return { tco2e: any ? sum : null, unpriceableFuels: [] };
}
