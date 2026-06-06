import { describe, it, expect } from 'vitest';
import { computeFine, computeAllPeriods, type BuildingInput } from './engine';

// The canonical demo building — a 44,800 sf Multifamily that is compliant in
// 2024-2029 and falls off the 2030 cliff. Limits hand-checked against the
// verbatim ESPM factors (Multifamily Housing: 0.00675 / 0.00334664 / 0.002692183):
//   2024-2029: 44,800 × 0.00675       = 302.40
//   2030-2034: 44,800 × 0.00334664    = 149.929472 → 149.93
//   2035-2039: 44,800 × 0.002692183   = 120.609798 → 120.61
const DEMO: BuildingInput = {
  grossFloorAreaSqft: 44_800,
  occupancyGroups: [{ group: 'Multifamily Housing', sqft: 44_800 }],
  annualEmissionsTco2e: 287.0,
};

describe('computeFine — golden (DOB-basis, the 2030 cliff)', () => {
  it('2024-2029: compliant, no fine', () => {
    const r = computeFine(DEMO, '2024-2029');
    expect(r.emissionsLimitTco2e).toBe(302.4);
    expect(r.overageTco2e).toBe(0);
    expect(r.annualFineUsd).toBe(0);
    expect(r.compliant).toBe(true);
    expect(r.pathway).toBe('standard');
  });

  it('2030-2034: over the cliff — overage 137.07, fine $36,734.90', () => {
    const r = computeFine(DEMO, '2030-2034');
    expect(r.emissionsLimitTco2e).toBe(149.93);
    expect(r.overageTco2e).toBe(137.07);
    // overage 137.070528 × $268, rounded to the cent.
    expect(r.annualFineUsd).toBe(36_734.9);
    expect(r.compliant).toBe(false);
  });

  it('2035-2039: limit tightens to 120.61', () => {
    const r = computeFine(DEMO, '2035-2039');
    expect(r.emissionsLimitTco2e).toBe(120.61);
    expect(r.compliant).toBe(false);
  });
});

describe('computeFine — mixed-use limit is the sum per use', () => {
  it('Office + Retail Store, 2024-2029', () => {
    // Office 0.00758 and Retail Store 0.00758 (2024-2029):
    // 30,000 × 0.00758 + 10,000 × 0.00758 = 227.4 + 75.8 = 303.2
    const b: BuildingInput = {
      grossFloorAreaSqft: 40_000,
      occupancyGroups: [
        { group: 'Office', sqft: 30_000 },
        { group: 'Retail Store', sqft: 10_000 },
      ],
      annualEmissionsTco2e: 0,
    };
    expect(computeFine(b, '2024-2029').emissionsLimitTco2e).toBe(303.2);
  });
});

describe('computeFine — Article 321 pathway', () => {
  it('no dollar fine; limit is the 2030 target; flagged', () => {
    const r = computeFine({ ...DEMO, isArticle321: true }, '2024-2029');
    expect(r.pathway).toBe('article321');
    expect(r.annualFineUsd).toBe(0);
    expect(r.compliant).toBe(true);
    expect(r.emissionsLimitTco2e).toBe(149.93); // 2030 target even in the 2024 period
    expect(r.notes.join(' ')).toContain('Article 321');
  });
});

describe('computeAllPeriods', () => {
  it('returns all three periods in order', () => {
    const all = computeAllPeriods(DEMO);
    expect(all.map(r => r.period)).toEqual(['2024-2029', '2030-2034', '2035-2039']);
  });
});

describe('computeFine — validation', () => {
  it('rejects an unknown property type', () => {
    expect(() =>
      computeFine(
        { grossFloorAreaSqft: 30_000, occupancyGroups: [{ group: 'Spaceport', sqft: 30_000 }], annualEmissionsTco2e: 0 },
        '2024-2029',
      ),
    ).toThrow(/not a known ESPM property type/);
  });

  it('rejects negative gross floor area', () => {
    expect(() =>
      computeFine({ grossFloorAreaSqft: -1, occupancyGroups: [{ group: 'Office', sqft: 0 }], annualEmissionsTco2e: 0 }, '2024-2029'),
    ).toThrow(/gross floor area/);
  });

  it('rejects occupancy area exceeding gross floor area', () => {
    expect(() =>
      computeFine({ grossFloorAreaSqft: 1000, occupancyGroups: [{ group: 'Office', sqft: 2000 }], annualEmissionsTco2e: 0 }, '2024-2029'),
    ).toThrow(/exceeds the gross/);
  });
});
