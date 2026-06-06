import { describe, it, expect } from 'vitest';
import { recomputeEmissions } from './emissions';

describe('recomputeEmissions', () => {
  it('electricity uses the period coefficient (grid greens over time)', () => {
    // 1,000,000 kWh × 0.000288962 = 288.962 (2024-2029)
    expect(recomputeEmissions({ electricity_kWh: 1_000_000 }, '2024-2029').tco2e).toBeCloseTo(288.962, 6);
    // same kWh, 2030-2034 coefficient 0.000145 → 145.0
    expect(recomputeEmissions({ electricity_kWh: 1_000_000 }, '2030-2034').tco2e).toBeCloseTo(145.0, 6);
  });

  it('sums a multi-fuel building', () => {
    // 500,000 kWh × 0.000288962 = 144.481
    // 2,000,000 kBtu gas × 0.00005311 = 106.22
    const r = recomputeEmissions({ electricity_kWh: 500_000, naturalGas_kBtu: 2_000_000 }, '2024-2029');
    expect(r.tco2e).toBeCloseTo(144.481 + 106.22, 6);
    expect(r.unpriceableFuels).toEqual([]);
  });

  it('returns null when no fuel data is supplied', () => {
    expect(recomputeEmissions({}, '2024-2029').tco2e).toBeNull();
  });

  it('rejects a negative fuel value', () => {
    expect(() => recomputeEmissions({ electricity_kWh: -5 }, '2024-2029')).toThrow(/non-negative/);
  });
});
