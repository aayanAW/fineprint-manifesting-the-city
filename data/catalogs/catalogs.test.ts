import { describe, it, expect } from 'vitest';
import { MEASURES } from '@/data/catalogs/measures';
import { REBATES } from '@/data/catalogs/rebates';

const MEASURE_KEYS = new Set(MEASURES.map((m) => m.key));

describe('catalogs integrity', () => {
  it('every rebate.measures[] key exists in MEASURES', () => {
    for (const r of REBATES) {
      expect(r.measures.length, `${r.name} funds no measures`).toBeGreaterThan(0);
      for (const key of r.measures) {
        expect(MEASURE_KEYS.has(key), `rebate "${r.name}" references unknown measure key "${key}"`).toBe(true);
      }
    }
  });

  it('every measure has Low<=High and a url', () => {
    for (const m of MEASURES) {
      expect(m.emissionsReductionPctLow, `${m.key} Low>High`).toBeLessThanOrEqual(m.emissionsReductionPctHigh);
      expect(m.emissionsReductionPctLow, `${m.key} negative Low`).toBeGreaterThanOrEqual(0);
      expect(typeof m.url, `${m.key} missing url`).toBe('string');
      expect(m.url.length, `${m.key} empty url`).toBeGreaterThan(0);
      expect(m.url.startsWith('http'), `${m.key} url not http(s)`).toBe(true);
    }
  });

  it('every measure key is unique', () => {
    expect(MEASURE_KEYS.size).toBe(MEASURES.length);
  });

  it('exposes the 7 expected verified measures', () => {
    const expected = [
      'heat-pump',
      'heat-pump-water-heater',
      'lighting',
      'envelope',
      'controls',
      'solar-pv',
      'weatherization',
    ].sort();
    expect([...MEASURE_KEYS].sort()).toEqual(expected);
  });

  it('amountNumericMaxUSD is null-or-positive for every rebate', () => {
    for (const r of REBATES) {
      const n = r.amountNumericMaxUSD;
      expect(n === null || (typeof n === 'number' && n > 0), `${r.name} has invalid amountNumericMaxUSD: ${n}`).toBe(
        true,
      );
    }
  });

  it('every rebate has a non-empty http url', () => {
    for (const r of REBATES) {
      expect(typeof r.url, `${r.name} missing url`).toBe('string');
      expect(r.url.startsWith('http'), `${r.name} url not http(s)`).toBe(true);
    }
  });

  it('at least one income-restricted program exists', () => {
    expect(REBATES.some((r) => r.incomeRestricted === true)).toBe(true);
  });

  it('includes the added C-PACE and NYC AHRF/REDi programs', () => {
    const names = REBATES.map((r) => r.name.toLowerCase());
    expect(names.some((n) => n.includes('c-pace'))).toBe(true);
    expect(names.some((n) => n.includes('ahrf'))).toBe(true);
    expect(names.some((n) => n.includes('redi'))).toBe(true);
  });
});
