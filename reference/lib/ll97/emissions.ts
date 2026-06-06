import { FUEL_COEFFICIENTS, KBTU_PER_THERM, Period } from './coefficients';

export interface EnergyUse {
  electricity_kWh?: number;
  naturalGas_therms?: number;
  fuelOil2_kBtu?: number;
  fuelOil4_kBtu?: number;
  districtSteam_kBtu?: number;
}

/** Annual building emissions (tCO2e) from raw fuel use, using LL97 coefficients. */
export function computeEmissions(use: EnergyUse, period: Period): number {
  const c = FUEL_COEFFICIENTS[period];
  return (
    (use.electricity_kWh ?? 0) * c.electricity_kWh +
    (use.naturalGas_therms ?? 0) * KBTU_PER_THERM * c.naturalGas_kBtu +
    (use.fuelOil2_kBtu ?? 0) * c.fuelOil2_kBtu +
    (use.fuelOil4_kBtu ?? 0) * c.fuelOil4_kBtu +
    (use.districtSteam_kBtu ?? 0) * c.districtSteam_kBtu
  );
}
