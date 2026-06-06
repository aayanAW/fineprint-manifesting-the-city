import { describe, it, expect } from 'vitest';
import { computeCandidateFixes, buildingFuels } from './roi';
import type { BuildingAssessment } from '@/types/assessment';
import type { Measure, RebateProgram } from '@/types/advise';

// Fake over-cap multifamily assessment: gas fuel, 50000 sqft, fines ~4020/yr (15 tCO2e * $268)
const fakeAssessment: BuildingAssessment = {
  building: {
    bbl: '1234567890',
    address: '123 Test St, New York, NY 10001',
    gfa: 50000,
    useTypes: [{ type: 'Multifamily Housing', gfa: 50000 }],
    primaryType: 'Multifamily Housing',
    reportYear: 2024,
    dataSource: 'manual',
  },
  energy: {
    naturalGas_therms: 7000,  // drives ~370 tCO2e for 2024-2029 period
    electricity_kWh: 0,
  },
  emissions: {
    method: 'fuel',
    byPeriod: {
      '2024-2029': 371.77,   // ~7000 therms * 100 kBtu/therm * 0.00005311 tCO2e/kBtu
      '2030-2034': 371.77,
      '2035-2039': 371.77,
    },
  },
  limits: {
    '2024-2029': 337.5,   // 50000 * 0.00675
    '2030-2034': 167.332,
    '2035-2039': 134.609,
  },
  fines: {
    '2024-2029': { excess_tCO2e: 34.27, annual_usd: 9184.36 },
    '2030-2034': { excess_tCO2e: 204.44, annual_usd: 54789.92 },
    '2035-2039': { excess_tCO2e: 237.16, annual_usd: 63558.88 },
  },
  covered: true,
  pathway: 'article320',
  flags: [],
};

// Override with the fine values given in the spec for tests
const fakeAssessmentSpec: BuildingAssessment = {
  ...fakeAssessment,
  fines: {
    // annual_usd must equal excess_tCO2e * $268 (as computeFine guarantees) — keep the fixture
    // internally consistent so excess-bounded avoided-fine math is exercised faithfully.
    '2024-2029': { excess_tCO2e: 15, annual_usd: 15 * 268 },   // 4020
    '2030-2034': { excess_tCO2e: 200, annual_usd: 200 * 268 }, // 53600
    '2035-2039': { excess_tCO2e: 230, annual_usd: 230 * 268 }, // 61640
  },
  emissions: {
    method: 'fuel',
    byPeriod: {
      '2024-2029': 370,
      '2030-2034': 370,
      '2035-2039': 370,
    },
  },
};

const measuresFixture: Measure[] = [
  {
    key: 'heat-pump',
    name: 'Heat Pump System',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 60,
    emissionsReductionPctHigh: 80,
    typicalCostPerUnitUSDMax: 12000,
    typicalCostNote: 'Per dwelling unit, installed',
    url: 'https://accelerator.nyc/heat-pump',
  },
  {
    key: 'lighting',
    name: 'LED Lighting Upgrade',
    appliesToFuel: ['any'],
    emissionsReductionPctLow: 5,
    emissionsReductionPctHigh: 10,
    typicalCostPerUnitUSDMax: 1500,
    typicalCostNote: 'Per dwelling unit, installed',
    url: 'https://accelerator.nyc/lighting',
  },
];

const rebatesFixture: RebateProgram[] = [
  {
    name: 'NYS Clean Heat',
    administrator: 'NYSERDA',
    measures: ['heat-pump', 'heat-pump-water-heater'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount: '$5,000–$12,000 per system',
    amountNumericMaxUSD: 12000,
    status: 'active',
    sunsetDate: null,
    url: 'https://cleanheat.ny.gov',
  },
];

// Rebate with appliesToMultifamily: false (residential 1-4 unit program).
const residentialRebate: RebateProgram = {
  name: 'Residential Heat Pump Rebate',
  administrator: 'Con Edison',
  measures: ['heat-pump'],
  appliesToMultifamily: false,
  incomeEligibleBonus: false,
  amount: '$8,000 per unit',
  amountNumericMaxUSD: 8000,
  status: 'active',
  sunsetDate: null,
  url: 'https://coned.com/residential',
};

// Two cash rebates for stacking test: $5,000 and $3,000 per unit.
const rebatesTwo: RebateProgram[] = [
  {
    name: 'Program A',
    administrator: 'NYSERDA',
    measures: ['heat-pump'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    amount: '$5,000 per unit',
    amountNumericMaxUSD: 5000,
    status: 'active',
    sunsetDate: null,
    url: 'https://example.com/a',
  },
  {
    name: 'Program B',
    administrator: 'Con Edison',
    measures: ['heat-pump'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    amount: '$3,000 per unit',
    amountNumericMaxUSD: 3000,
    status: 'active',
    sunsetDate: null,
    url: 'https://example.com/b',
  },
];

// Income-restricted rebate with higher amount — only unlocked for affordable buildings.
const affordableRebate: RebateProgram = {
  name: 'Con Edison Affordable Multifamily Energy Efficiency Program (AMEEP)',
  administrator: 'Con Edison / NYS Affordable Multifamily Energy Efficiency Program',
  measures: ['heat-pump'],
  appliesToMultifamily: true,
  incomeEligibleBonus: true,
  incomeRestricted: true,
  amount: '$18,400 per unit (affordable)',
  amountNumericMaxUSD: 18400,
  status: 'active',
  sunsetDate: null,
  url: 'https://coned.com/ameep',
};

// Competitive demonstration grant: a real dollar amount but NOT an as-of-right entitlement —
// must appear as an informational chip yet never drive net-cost math.
const competitiveGrant: RebateProgram = {
  name: 'NYSERDA Through-Wall Heat Pump Field Demonstration',
  administrator: 'NYSERDA',
  measures: ['heat-pump'],
  appliesToMultifamily: true,
  incomeEligibleBonus: false,
  asOfRight: false,
  amount: 'up to $20,000 per apartment (competitive, selection required)',
  amountNumericMaxUSD: 20000,
  status: 'active',
  sunsetDate: null,
  url: 'https://nyserda.ny.gov/demo',
};

// Tax credit/deduction: positive headline number but not cash for net-cost purposes.
const taxCreditRebate: RebateProgram = {
  name: 'Federal New Construction Credit',
  administrator: 'IRS',
  measures: ['heat-pump'],
  appliesToMultifamily: true,
  incomeEligibleBonus: false,
  cashEligible: false,
  amount: 'up to $5,000 per unit (tax credit, new construction only)',
  amountNumericMaxUSD: 5000,
  status: 'active',
  sunsetDate: null,
  url: 'https://irs.gov/credit',
};

describe('buildingFuels', () => {
  it('returns ["gas"] for a gas-only building', () => {
    const result = buildingFuels(fakeAssessment);
    expect(result).toEqual(['gas']);
  });

  it('returns multiple fuels for a mixed building', () => {
    const mixed: BuildingAssessment = {
      ...fakeAssessment,
      energy: { naturalGas_therms: 1000, electricity_kWh: 500000, fuelOil2_kBtu: 100000 },
    };
    const result = buildingFuels(mixed);
    expect(result).toContain('gas');
    expect(result).toContain('oil');
    expect(result).toContain('electric');
  });

  it('returns empty for a building with no energy data', () => {
    const noEnergy: BuildingAssessment = { ...fakeAssessment, energy: {} };
    const result = buildingFuels(noEnergy);
    expect(result).toEqual([]);
  });
});

describe('computeCandidateFixes', () => {
  it('returns non-empty candidates for a gas building', () => {
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesFixture);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('heat-pump candidate has at least one matched rebate', () => {
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesFixture);
    const hpCandidate = candidates.find(c => c.measureKey === 'heat-pump');
    expect(hpCandidate).toBeDefined();
    expect(hpCandidate!.matchedRebates.length).toBeGreaterThanOrEqual(1);
  });

  it('fineAvoidedUSD is <= fine for every candidate', () => {
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesFixture);
    const fine = fakeAssessmentSpec.fines['2024-2029'].annual_usd;
    for (const c of candidates) {
      expect(c.fineAvoidedUSD).toBeLessThanOrEqual(fine + 0.01); // small float tolerance
    }
  });

  it('results are sorted by paybackYears ascending (nulls last)', () => {
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesFixture);
    for (let i = 0; i < candidates.length - 1; i++) {
      const a = candidates[i].paybackYears ?? Infinity;
      const b = candidates[i + 1].paybackYears ?? Infinity;
      expect(a).toBeLessThanOrEqual(b);
    }
  });

  it('includes the lighting measure (appliesToFuel: any) for a gas building', () => {
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesFixture);
    const lighting = candidates.find(c => c.measureKey === 'lighting');
    expect(lighting).toBeDefined();
  });

  it('excludes measures that do not apply to building fuels', () => {
    const electricOnlyMeasure: Measure = {
      key: 'solar-pv',
      name: 'Solar PV',
      appliesToFuel: ['electric'],
      emissionsReductionPctLow: 10,
      emissionsReductionPctHigh: 20,
      typicalCostPerUnitUSDMax: 5000,
      typicalCostNote: 'Per dwelling unit',
      url: 'https://accelerator.nyc/solar',
    };
    // Gas-only building should not get electric-only measure
    const gasOnlyAssessment: BuildingAssessment = {
      ...fakeAssessmentSpec,
      energy: { naturalGas_therms: 7000 },
    };
    const allMeasures = [...measuresFixture, electricOnlyMeasure];
    const candidates = computeCandidateFixes(gasOnlyAssessment, allMeasures, rebatesFixture);
    const solar = candidates.find(c => c.measureKey === 'solar-pv');
    expect(solar).toBeUndefined();
  });

  it('tenure gate: rebate with appliesToMultifamily:false does NOT appear for a multifamily building', () => {
    // fakeAssessment has primaryType 'Multifamily Housing' — residentialRebate has appliesToMultifamily:false
    const rebatesWithResidential = [...rebatesFixture, residentialRebate];
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesWithResidential);
    for (const c of candidates) {
      const names = c.matchedRebates.map(r => r.name);
      expect(names).not.toContain(residentialRebate.name);
    }
  });

  it('netCostUSD uses SINGLE best per-unit rebate (not sum) scaled by unit count', () => {
    // Fixture: gfa=50000, units = round(50000/900) = 56
    // heat-pump cost: $12000/unit, two cash rebates $5000 and $3000/unit
    // Best single = $5000 => net = (12000 - 5000) * 56 = 392000
    // Stacked (wrong) would be (12000 - 8000) * 56 = 224000
    const units = Math.round(fakeAssessmentSpec.building.gfa / 900);
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesTwo);
    const hp = candidates.find(c => c.measureKey === 'heat-pump');
    expect(hp).toBeDefined();
    const expectedNet = (12000 - 5000) * units;
    expect(hp!.netCostUSD).toBe(expectedNet);
    // Confirm it is NOT the stacked result
    const stackedNet = (12000 - 8000) * units;
    expect(hp!.netCostUSD).not.toBe(stackedNet);
  });

  it('affordable:true unlocks income-restricted rebate and lowers netCostUSD vs affordable:false', () => {
    // affordableRebate has incomeRestricted:true => isAffordableOnly => blocked when affordable=false
    const rebatesWithAffordable = [...rebatesFixture, affordableRebate];
    const units = Math.round(fakeAssessmentSpec.building.gfa / 900);

    const candidatesMarket = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesWithAffordable, '2024-2029', false);
    const candidatesAffordable = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebatesWithAffordable, '2024-2029', true);

    const hpMarket = candidatesMarket.find(c => c.measureKey === 'heat-pump')!;
    const hpAffordable = candidatesAffordable.find(c => c.measureKey === 'heat-pump')!;

    // Affordable rebate NOT in market-rate results
    expect(hpMarket.matchedRebates.map(r => r.name)).not.toContain(affordableRebate.name);
    // Affordable rebate IS in affordable results
    expect(hpAffordable.matchedRebates.map(r => r.name)).toContain(affordableRebate.name);

    // netCostUSD must be lower for affordable (best single rebate is $18400 vs $12000)
    // market: net = (12000 - 12000) * units = 0 (rebatesFixture has $12000 rebate)
    // affordable: net = (12000 - 18400) * units => clamped to 0 by Math.max(0,...)
    // But affordable has a higher best-single so net should be <= market net
    expect(hpAffordable.netCostUSD!).toBeLessThanOrEqual(hpMarket.netCostUSD!);

    // Sanity: grossCostUSD matches
    expect(hpMarket.grossCostUSD).toBe(12000 * units);
  });

  it('competitive grant (asOfRight:false) appears as a matched chip but does NOT lower net cost', () => {
    const units = Math.round(fakeAssessmentSpec.building.gfa / 900);
    // rebatesFixture has a $12,000 as-of-right rebate; competitiveGrant is $20,000 but asOfRight:false.
    const rebates = [...rebatesFixture, competitiveGrant];
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, rebates);
    const hp = candidates.find(c => c.measureKey === 'heat-pump')!;
    // It is surfaced to the user (informational chip)...
    expect(hp.matchedRebates.map(r => r.name)).toContain(competitiveGrant.name);
    // ...but the $20k grant must NOT be the best-cash rebate; net uses the $12k as-of-right one.
    expect(hp.netCostUSD).toBe((12000 - 12000) * units); // 0, not driven below by the $20k grant
  });

  it('tax credit (cashEligible:false) is shown but excluded from net-cost math', () => {
    const units = Math.round(fakeAssessmentSpec.building.gfa / 900);
    // Only the tax credit available -> no cash rebate -> net == gross (no reduction).
    const candidates = computeCandidateFixes(fakeAssessmentSpec, measuresFixture, [taxCreditRebate]);
    const hp = candidates.find(c => c.measureKey === 'heat-pump')!;
    expect(hp.matchedRebates.map(r => r.name)).toContain(taxCreditRebate.name);
    expect(hp.netCostUSD).toBe(12000 * units); // full gross, the $5k credit did not reduce it
  });

  it('non-positive GFA nulls out unit-scaled cost/payback instead of inventing a 1-unit estimate', () => {
    for (const badGfa of [0, -5000]) {
      const bad: BuildingAssessment = {
        ...fakeAssessmentSpec,
        building: { ...fakeAssessmentSpec.building, gfa: badGfa },
      };
      const candidates = computeCandidateFixes(bad, measuresFixture, rebatesTwo);
      const hp = candidates.find(c => c.measureKey === 'heat-pump')!;
      expect(hp.grossCostUSD).toBeNull();
      expect(hp.netCostUSD).toBeNull();
      expect(hp.paybackYears).toBeNull();
    }
  });

  it('against the 2030-2034 cliff, a small-cut fix avoids less than a large-cut fix (meaningful ranking)', () => {
    // fakeAssessment 2030-2034: emissions 371.77, excess 204.44, fine ~$54,790.
    const small: Measure = { key: 'small', name: 'Small', appliesToFuel: ['any'], emissionsReductionPctLow: 5, emissionsReductionPctHigh: 5, typicalCostPerUnitUSDMax: null, typicalCostNote: '', url: 'x' };
    const big: Measure = { key: 'big', name: 'Big', appliesToFuel: ['gas', 'oil', 'steam'], emissionsReductionPctLow: 80, emissionsReductionPctHigh: 80, typicalCostPerUnitUSDMax: null, typicalCostNote: '', url: 'x' };
    const c = computeCandidateFixes(fakeAssessment, [small, big], rebatesFixture, '2030-2034');
    const sm = c.find(x => x.measureKey === 'small')!;
    const bg = c.find(x => x.measureKey === 'big')!;
    // small cuts 5% of 371.77 = 18.6 tCO2e (< excess 204) -> avoids 18.6*268 ≈ $4,984
    expect(sm.fineAvoidedUSD).toBeCloseTo(371.77 * 0.05 * 268, 0);
    // big cuts 80% (> excess) -> caps at the full 2030 fine, strictly more than small
    expect(bg.fineAvoidedUSD).toBeGreaterThan(sm.fineAvoidedUSD);
    expect(bg.fineAvoidedUSD).toBeCloseTo(fakeAssessment.fines['2030-2034'].annual_usd, 0);
  });

  it('avoided fine is capped at the excess a measure actually removes (differentiates small fixes)', () => {
    // Spec building is 15 tCO2e over cap. A measure that cuts < 15 tCO2e must avoid < the full fine.
    const tinyMeasure: Measure = {
      key: 'tiny',
      name: 'Tiny measure',
      appliesToFuel: ['any'],
      emissionsReductionPctLow: 2,   // 2% of 370 = 7.4 tCO2e, below the 15 tCO2e excess
      emissionsReductionPctHigh: 2,
      typicalCostPerUnitUSDMax: null,
      typicalCostNote: '',
      url: 'https://example.com/tiny',
    };
    const candidates = computeCandidateFixes(fakeAssessmentSpec, [tinyMeasure], rebatesFixture);
    const tiny = candidates.find(c => c.measureKey === 'tiny')!;
    const excess = fakeAssessmentSpec.fines['2024-2029'].excess_tCO2e; // 15
    const fine = fakeAssessmentSpec.fines['2024-2029'].annual_usd;      // 4020 (15 * 268)
    // 7.4 tCO2e * $268 ≈ $1,983 — strictly less than the full $4,020 fine.
    expect(tiny.fineAvoidedUSD).toBeCloseTo(370 * 0.02 * 268, 2);
    expect(tiny.fineAvoidedUSD).toBeLessThan(fine);
    expect(tiny.fineAvoidedUSD).toBeLessThan(excess * 268 + 0.01);
  });
});
