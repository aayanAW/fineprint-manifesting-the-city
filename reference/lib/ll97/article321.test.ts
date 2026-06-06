import { describe, it, expect } from 'vitest';
import { article321View, PECM_CHECKLIST } from './article321';
import type { BuildingAssessment } from '@/types/assessment';

function makeAssessment(current: number, target: number): BuildingAssessment {
  return {
    building: {
      bbl: '1',
      address: '123 Test St',
      gfa: 50000,
      useTypes: [{ type: 'Multifamily Housing', gfa: 50000 }],
      primaryType: 'Multifamily Housing',
      reportYear: 2023,
      dataSource: 'benchmarking',
    },
    energy: { reportedGHG_tCO2e: current },
    emissions: {
      method: 'reported',
      byPeriod: {
        '2024-2029': current,
        '2030-2034': current,
        '2035-2039': current,
      },
    },
    limits: {
      '2024-2029': 999,
      '2030-2034': target,
      '2035-2039': 0,
    },
    fines: {
      '2024-2029': { excess_tCO2e: 0, annual_usd: 0 },
      '2030-2034': { excess_tCO2e: 0, annual_usd: 0 },
      '2035-2039': { excess_tCO2e: 0, annual_usd: 0 },
    },
    covered: true,
    pathway: 'likely-article321',
    flags: [],
  };
}

describe('article321View', () => {
  it('returns 13 PECMs', () => {
    const a = makeAssessment(100, 200);
    const v = article321View(a);
    expect(v.pecms).toHaveLength(13);
    expect(v.pecms).toEqual(PECM_CHECKLIST);
  });

  it('meets2030 is true when current <= target (100 <= 200)', () => {
    const a = makeAssessment(100, 200);
    const v = article321View(a);
    expect(v.current_tCO2e).toBe(100);
    expect(v.target2030_tCO2e).toBe(200);
    expect(v.meets2030).toBe(true);
  });

  it('meets2030 is false when current > target (300 > 200)', () => {
    const a = makeAssessment(300, 200);
    const v = article321View(a);
    expect(v.current_tCO2e).toBe(300);
    expect(v.target2030_tCO2e).toBe(200);
    expect(v.meets2030).toBe(false);
  });
});
