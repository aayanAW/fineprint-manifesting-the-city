import { describe, it, expect } from 'vitest';
import { computeEmissions } from './emissions';

describe('computeEmissions', () => {
  // DOB example: 310,000 kWh + 2,250,000 kBtu gas (=22,500 therms) + 1,050,000 kBtu #2 oil
  it('matches DOB worked example: 287.00 tCO2e in 2024-2029', () => {
    const e = computeEmissions(
      { electricity_kWh: 310000, naturalGas_therms: 22500, fuelOil2_kBtu: 1050000 },
      '2024-2029',
    );
    expect(e).toBeCloseTo(287.0, 1);
  });
  it('drops in 2030 as the electricity coefficient halves', () => {
    const base = computeEmissions({ electricity_kWh: 310000 }, '2024-2029');
    const later = computeEmissions({ electricity_kWh: 310000 }, '2030-2034');
    expect(later).toBeLessThan(base);
  });
});
