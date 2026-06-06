import { describe, it, expect } from 'vitest';
import { computeLimit, unresolvedTypes, factorFor } from './limit';

describe('computeLimit', () => {
  it('multifamily 40,000 sf -> 270.00 tCO2e in 2024-2029', () => {
    expect(computeLimit([{ type: 'Multifamily Housing', gfa: 40000 }], '2024-2029')).toBeCloseTo(270.0, 2);
  });
  it('multifamily 52,941 sf -> 357.35 tCO2e', () => {
    expect(computeLimit([{ type: 'Multifamily Housing', gfa: 52941 }], '2024-2029')).toBeCloseTo(357.35, 1);
  });
  it('sums multiple space-use types', () => {
    const limit = computeLimit([{ type: 'Multifamily Housing', gfa: 40000 }, { type: 'Office', gfa: 5000 }], '2024-2029');
    expect(limit).toBeCloseTo(40000 * 0.00675 + 5000 * 0.00758, 2);
  });
  it('reports types that do not resolve to a factor', () => {
    expect(unresolvedTypes([{ type: 'Bogus Type', gfa: 1000 }], '2024-2029')).toEqual(['Bogus Type']);
    expect(unresolvedTypes([{ type: 'Multifamily Housing', gfa: 1 }], '2035-2039')).toEqual([]);
  });
});

describe('factorFor alias/normalize', () => {
  it('resolves "Senior Living Community" via alias to 0.01138 in 2024-2029', () => {
    expect(factorFor('Senior Living Community', '2024-2029')).toBe(0.01138);
  });
  it('resolves "Vehicle Dealership" via alias to 0.00675 in 2024-2029', () => {
    expect(factorFor('Vehicle Dealership', '2024-2029')).toBe(0.00675);
  });
  it('resolves "office " (trailing space) via normalization to a number > 0 in 2035-2039', () => {
    const v = factorFor('office ', '2035-2039');
    expect(v).toBeDefined();
    expect(v as number).toBeGreaterThan(0);
  });

  // P1-6: aliases must resolve through case/whitespace/punctuation variants, not just exact-match.
  it('resolves a lowercase alias variant ("senior living community") to 0.01138', () => {
    expect(factorFor('senior living community', '2024-2029')).toBe(0.01138);
  });
  it('resolves an alias with a trailing space ("Senior Living Community ") to 0.01138', () => {
    expect(factorFor('Senior Living Community ', '2024-2029')).toBe(0.01138);
  });
  it('resolves a lowercase "vehicle dealership" to 0.00675', () => {
    expect(factorFor('vehicle dealership', '2024-2029')).toBe(0.00675);
  });
  it('resolves "bar/nightclub" (punctuation variant) to the Other - Restaurant/Bar factor 0.02381', () => {
    expect(factorFor('bar/nightclub', '2024-2029')).toBe(0.02381);
  });
  it('a use-type whose alias has a case variant is NOT dropped from the limit', () => {
    const limit = computeLimit([{ type: 'senior living community', gfa: 10000 }], '2024-2029');
    expect(limit).toBeCloseTo(10000 * 0.01138, 2);
    expect(unresolvedTypes([{ type: 'senior living community', gfa: 10000 }], '2024-2029')).toEqual([]);
  });
});
