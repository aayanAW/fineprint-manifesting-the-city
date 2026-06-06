import { describe, it, expect } from 'vitest';
import { buildAssessment } from './assess';

describe('buildAssessment', () => {
  const input = {
    building: { bbl: '2042500026', address: '1870 Pelham Parkway South', gfa: 52941,
      useTypes: [{ type: 'Multifamily Housing', gfa: 52941 }], primaryType: 'Multifamily Housing',
      reportYear: 2023, dataSource: 'benchmarking' as const },
    energy: { reportedGHG_tCO2e: 216.1 },
  };

  it('reports compliant (216.1 < 357.35) with $0 fine in 2024-2029', () => {
    const a = buildAssessment(input);
    expect(a.limits['2024-2029']).toBeCloseTo(357.35, 1);
    expect(a.fines['2024-2029'].annual_usd).toBe(0);
  });
  it('produces a fine for every compliance period', () => {
    const a = buildAssessment(input);
    expect(Object.keys(a.fines)).toEqual(['2024-2029', '2030-2034', '2035-2039']);
  });
  it('flags unmapped property types across all periods and does not hide them', () => {
    const a = buildAssessment({
      building: { bbl: '1', address: 'x', gfa: 50000, useTypes: [{ type: 'Multifamily Housing', gfa: 40000 }, { type: 'Bogus Type', gfa: 10000 }], primaryType: 'Multifamily Housing', reportYear: 2023, dataSource: 'benchmarking' },
      energy: { reportedGHG_tCO2e: 100 },
    });
    expect(a.flags).toContain('unmapped-property-type');
    expect(a.flags).toContain('mixed-use-estimate');
  });
  it('flags missing GFA and is not covered when gfa is 0', () => {
    const a = buildAssessment({
      building: { bbl: '1', address: 'x', gfa: 0, useTypes: [{ type: 'Multifamily Housing', gfa: 0 }], primaryType: 'Multifamily Housing', reportYear: 2023, dataSource: 'benchmarking' },
      energy: { reportedGHG_tCO2e: 216.1 },
    });
    expect(a.flags).toContain('missing-gfa');
    expect(a.covered).toBe(false);
  });
  it('treats district steam as fuel data (method=fuel)', () => {
    const a = buildAssessment({
      building: { bbl: '1', address: 'x', gfa: 50000, useTypes: [{ type: 'Multifamily Housing', gfa: 50000 }], primaryType: 'Multifamily Housing', reportYear: 2023, dataSource: 'benchmarking' },
      energy: { districtSteam_kBtu: 1000000 },
    });
    expect(a.emissions.method).toBe('fuel');
  });
  it('merges seed flags from the data layer', () => {
    const a = buildAssessment({
      building: { bbl: '1', address: 'x', gfa: 50000, useTypes: [{ type: 'Multifamily Housing', gfa: 50000 }], primaryType: 'Multifamily Housing', reportYear: 2023, dataSource: 'benchmarking' },
      energy: { reportedGHG_tCO2e: 100 }, flags: ['unmapped-fuel-undercount'],
    });
    expect(a.flags).toContain('unmapped-fuel-undercount');
  });
  it('does NOT flag mixed-use when the only extra space type is a duplicate of the first', () => {
    // Residual back-fill can produce two entries of the same type — that is not genuinely mixed-use.
    const a = buildAssessment({
      building: { bbl: '1', address: 'x', gfa: 100000, useTypes: [{ type: 'Office', gfa: 60000 }, { type: 'Office', gfa: 40000 }], primaryType: 'Office', reportYear: 2023, dataSource: 'benchmarking' },
      energy: { reportedGHG_tCO2e: 100 },
    });
    expect(a.flags).not.toContain('mixed-use-estimate');
  });
  it('flags limit-unavailable when only use type is totally unknown and gfa > 0', () => {
    const a = buildAssessment({
      building: { bbl: '1', address: 'x', gfa: 50000, useTypes: [{ type: 'Totally Unknown Type', gfa: 50000 }], primaryType: 'Totally Unknown Type', reportYear: 2023, dataSource: 'benchmarking' },
      energy: { reportedGHG_tCO2e: 100 },
    });
    expect(a.flags).toContain('limit-unavailable');
  });
});
