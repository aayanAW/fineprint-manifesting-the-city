import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESPM_FACTORS_TCO2E_PER_SQFT } from '@/lib/ll97/constants';
import { parseLl84Rows } from './ll84';

// Real LL84 disclosure rows (Socrata 5zyy-y8am) recorded 2026-06-06. The Empire
// State Building's 2024 filing: 2,852,257 sqft across eight property uses,
// 16,678.22 tCO2e location-based GHG. Tested OFFLINE against the fixture.
const esbRows = JSON.parse(
  readFileSync(new URL('../../test/fixtures/ll84-1008350041.json', import.meta.url), 'utf8'),
);
const noFiling = JSON.parse(
  readFileSync(new URL('../../test/fixtures/ll84-no-filing.json', import.meta.url), 'utf8'),
);

describe('parseLl84Rows — Empire State Building fixture (offline)', () => {
  it('extracts the building facts from the latest filing', () => {
    const facts = parseLl84Rows(esbRows, '1008350041');
    expect(facts).not.toBeNull();
    expect(facts!.bbl).toBe('1008350041');
    expect(facts!.reportingYear).toBe(2024);
    expect(facts!.grossFloorAreaSqft).toBe(2_852_257);
    expect(facts!.annualEmissionsTco2e).toBe(16_678.22);
    expect(facts!.reportedAddress).toMatch(/Empire State/i);
  });

  it('splits the property uses with their square footage', () => {
    const facts = parseLl84Rows(esbRows, '1008350041');
    const office = facts!.occupancyGroups.find((use) => use.group === 'Office');
    expect(facts!.occupancyGroups).toHaveLength(8);
    expect(office?.sqft).toBe(2_692_475.1);
  });

  it('maps LL84 use names onto the engine ESPM vocabulary', () => {
    const facts = parseLl84Rows(esbRows, '1008350041');
    // LL84 says "Community Center and Social Meeting Hall"; the engine knows it
    // as "Social/Meeting Hall".
    const meetingHall = facts!.occupancyGroups.find((use) => use.group === 'Social/Meeting Hall');
    expect(meetingHall?.sqft).toBe(56_815);
    // The original LL84 long name must NOT survive in occupancyGroups.
    expect(
      facts!.occupancyGroups.find((u) => u.group === 'Community Center and Social Meeting Hall'),
    ).toBeUndefined();
    // Every mapped group is a name the engine's factor table accepts.
    for (const use of facts!.occupancyGroups) {
      expect(
        ESPM_FACTORS_TCO2E_PER_SQFT['2024-2029'][use.group],
        `"${use.group}" is not a name the engine accepts`,
      ).toBeDefined();
    }
  });

  it('returns null when there is no filing, not a guess', () => {
    expect(parseLl84Rows(noFiling, '9999999999')).toBeNull();
  });

  it('never lets "Not Available" become a number — null, never NaN', () => {
    const rows = structuredClone(esbRows);
    rows[0].total_location_based_ghg = 'Not Available';
    rows[0].property_gfa_calculated = 'Not Available';
    rows[0].property_gfa_self_reported = 'Not Available';
    const facts = parseLl84Rows(rows, '1008350041');
    expect(facts!.annualEmissionsTco2e).toBeNull();
    expect(facts!.grossFloorAreaSqft).toBeNull();
    expect(Number.isNaN(facts!.recomputedEmissionsTco2e as number)).toBe(false);
  });

  it('renamed ESPM types map to the rule name silently (no proxy disclosure)', () => {
    const rows = structuredClone(esbRows);
    rows[0].list_of_all_property_use = 'Senior Living Community (80000.0)';
    const facts = parseLl84Rows(rows, '1008350041');
    expect(facts!.occupancyGroups).toEqual([{ group: 'Senior Care Community', sqft: 80_000 }]);
    expect(facts!.proxiedUses).toEqual([]);
  });

  it('types missing from the rule map to the nearest bucket and say so', () => {
    const rows = structuredClone(esbRows);
    rows[0].list_of_all_property_use = 'Fire Station (12000.0), Bar/Nightclub (3000.0)';
    const facts = parseLl84Rows(rows, '1008350041');
    expect(facts!.occupancyGroups).toEqual([
      { group: 'Other - Public Services', sqft: 12_000 },
      { group: 'Other - Restaurant/Bar', sqft: 3_000 },
    ]);
    expect(facts!.proxiedUses).toEqual([
      { from: 'Fire Station', to: 'Other - Public Services' },
      { from: 'Bar/Nightclub', to: 'Other - Restaurant/Bar' },
    ]);
  });

  it('unmappable types are excluded from engine input, not guessed', () => {
    const rows = structuredClone(esbRows);
    rows[0].list_of_all_property_use = 'Office (90000.0), Other (10000.0)';
    const facts = parseLl84Rows(rows, '1008350041');
    expect(facts!.occupancyGroups).toEqual([{ group: 'Office', sqft: 90_000 }]);
    expect(facts!.unmappedUses).toEqual([{ group: 'Other', sqft: 10_000 }]);
  });

  it('recomputes emissions with the engine statute coefficients (DOB basis)', () => {
    const facts = parseLl84Rows(esbRows, '1008350041');
    // natural gas 5,469,879.2 × 0.00005311 + district steam 64,363,489.2 ×
    // 0.00004493 + grid electricity 30,849,800.6 × 0.000288962 ≈ 12,096.78.
    expect(facts!.recomputedEmissionsTco2e as number).toBeCloseTo(12_096.78, 1);
    expect(facts!.annualEmissionsTco2e).toBe(16_678.22);
    expect(facts!.unpriceableFuels).toEqual([]);
  });

  it('a fuel with no verified coefficient blocks the recompute, visibly', () => {
    const rows = structuredClone(esbRows);
    rows[0].fuel_oil_5_6_use_kbtu = '100000';
    const facts = parseLl84Rows(rows, '1008350041');
    expect(facts!.recomputedEmissionsTco2e).toBeNull();
    expect(facts!.unpriceableFuels).toEqual(['fuel_oil_5_6_use_kbtu']);
  });

  it('a campus year with parent and child rows keeps the largest filing', () => {
    const rows = structuredClone(esbRows);
    const childRow = structuredClone(esbRows[0]);
    childRow.property_gfa_calculated = '150000';
    childRow.list_of_all_property_use = 'Office (150000.0)';
    rows.unshift(childRow);
    const facts = parseLl84Rows(rows, '1008350041');
    expect(facts!.grossFloorAreaSqft).toBe(2_852_257);
  });
});
