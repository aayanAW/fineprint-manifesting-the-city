import { describe, expect, it } from 'vitest';
import { getCblEntry, isLl97Covered } from './coveredBuildings';

// Reads data/cbl/cbl26.json.gz — a committed snapshot of DOB's Covered
// Buildings List for filing year 2026. Test BBLs are real entries from the
// snapshot:
//   1008350041  Empire State Building — LL97 pathway 0 (standard)
//   1000087501  39 Whitehall St — pathway 3, Article 321
//   1000020023  1 Pike St — LL84 only, not LL97-covered
describe('Covered Buildings List loader (cbl26.json.gz)', () => {
  it('returns an entry for a known covered BBL with the locked contract shape', () => {
    const entry = getCblEntry('1008350041');
    expect(entry).not.toBeNull();
    expect(entry?.bbl).toBe('1008350041');
    expect(entry?.ll97).toBe(true);
    expect(entry?.sqft).toBe(2_812_739);
    expect(entry?.address).toMatch(/5 AVENUE/i);
    expect(entry?.source).toMatch(/Covered Buildings List/);
  });

  it('article321 reflects CBL compliance pathway 3', () => {
    // Empire State Building is pathway [0] → not Article 321.
    expect(getCblEntry('1008350041')?.article321).toBe(false);
    // 39 Whitehall St is pathway [3] → Article 321.
    const a321 = getCblEntry('1000087501');
    expect(a321?.ll97).toBe(true);
    expect(a321?.article321).toBe(true);
  });

  it('an LL84-only building is not LL97-covered', () => {
    expect(isLl97Covered('1000020023')).toBe(false);
    expect(getCblEntry('1000020023')?.ll97).toBe(false);
  });

  it('returns null for a BBL absent from the list', () => {
    expect(getCblEntry('0000000000')).toBeNull();
  });

  it('isLl97Covered is false for an unknown BBL', () => {
    expect(isLl97Covered('0000000000')).toBe(false);
  });
});
