import { describe, it, expect } from 'vitest';
import { PENALTY_USD_PER_TON, FUEL_COEFFICIENTS, EMISSIONS_FACTORS } from './coefficients';

describe('LL97 constants', () => {
  it('penalty rate is $268/tCO2e', () => {
    expect(PENALTY_USD_PER_TON).toBe(268);
  });
  it('2024-2029 electricity coefficient is 0.000288962 tCO2e/kWh', () => {
    expect(FUEL_COEFFICIENTS['2024-2029'].electricity_kWh).toBe(0.000288962);
  });
  it('electricity coefficient falls sharply by 2035-2039', () => {
    expect(FUEL_COEFFICIENTS['2035-2039'].electricity_kWh).toBeLessThan(FUEL_COEFFICIENTS['2024-2029'].electricity_kWh);
  });
  it('multifamily (R-2) limit is 0.00675 tCO2e/sf in 2024-2029', () => {
    expect(EMISSIONS_FACTORS['2024-2029']['Multifamily Housing']).toBe(0.00675);
  });
  it('non-multifamily types resolve in EVERY period (no alias gap)', () => {
    expect(EMISSIONS_FACTORS['2030-2034']['Office']).toBeCloseTo(0.002690852, 9);
    expect(EMISSIONS_FACTORS['2035-2039']['Office']).toBeGreaterThan(0);
  });
  it('multifamily 2030-2034 limit is the verified 0.00334664 (1 RCNY 103-14)', () => {
    expect(EMISSIONS_FACTORS['2030-2034']['Multifamily Housing']).toBe(0.00334664);
  });
});
