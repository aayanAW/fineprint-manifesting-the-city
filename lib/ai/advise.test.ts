import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeRanking } from './advise';
import type { BuildingAssessment } from '@/types/assessment';
import type { FixCandidate } from '@/types/advise';

const mk = (measureKey: string): FixCandidate => ({
  measureKey, measure: measureKey, tCO2eReduced: 10, grossCostUSD: null,
  matchedRebates: [], netCostUSD: null, paybackYears: null, fineAvoidedUSD: 100,
});

describe('mergeRanking', () => {
  const candidates = [mk('heat-pump'), mk('lighting'), mk('solar-pv')];

  it('returns each candidate EXACTLY once (no spread-copy identity duplication)', () => {
    const ranked = mergeRanking(candidates, ['lighting', 'heat-pump', 'solar-pv'], new Map());
    expect(ranked).toHaveLength(candidates.length);
    expect(new Set(ranked.map(r => r.measureKey)).size).toBe(candidates.length);
  });

  it('honors the order, then appends candidates the order omitted', () => {
    const ranked = mergeRanking(candidates, ['solar-pv'], new Map());
    expect(ranked.map(r => r.measureKey)).toEqual(['solar-pv', 'heat-pump', 'lighting']);
  });

  it('ignores unknown/duplicate keys in the order without duplicating output', () => {
    const ranked = mergeRanking(candidates, ['bogus', 'heat-pump', 'heat-pump', 'lighting'], new Map());
    expect(ranked.map(r => r.measureKey)).toEqual(['heat-pump', 'lighting', 'solar-pv']);
  });

  it('attaches rationales by measureKey', () => {
    const ranked = mergeRanking(candidates, ['heat-pump'], new Map([['heat-pump', 'best payback']]));
    expect(ranked.find(r => r.measureKey === 'heat-pump')!.rationale).toBe('best payback');
  });
});

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
  energy: { naturalGas_therms: 7000 },
  emissions: {
    method: 'fuel',
    byPeriod: {
      '2024-2029': 370,
      '2030-2034': 370,
      '2035-2039': 370,
    },
  },
  limits: {
    '2024-2029': 337.5,
    '2030-2034': 167.33,
    '2035-2039': 134.61,
  },
  fines: {
    '2024-2029': { excess_tCO2e: 15, annual_usd: 4020 },
    '2030-2034': { excess_tCO2e: 202.67, annual_usd: 54315.56 },
    '2035-2039': { excess_tCO2e: 235.39, annual_usd: 63084.52 },
  },
  covered: true,
  pathway: 'article320',
  flags: [],
};

const fakeCandidates: FixCandidate[] = [
  {
    measureKey: 'heat-pump',
    measure: 'Heat Pump System',
    tCO2eReduced: 259,
    grossCostUSD: 770000,
    matchedRebates: [{ name: 'NYS Clean Heat', amount: '$5,000–$12,000 per system', amountShort: 'up to $12k/unit', url: 'https://cleanheat.ny.gov' }],
    netCostUSD: 758000,
    paybackYears: 188.6,
    fineAvoidedUSD: 4020,
  },
  {
    measureKey: 'lighting',
    measure: 'LED Lighting Upgrade',
    tCO2eReduced: 27.75,
    grossCostUSD: 66667,
    matchedRebates: [],
    netCostUSD: 66667,
    paybackYears: 16.6,
    fineAvoidedUSD: 4020,
  },
];

describe('generateAdvice (no API key — fallback)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('returns source:"fallback" when ANTHROPIC_API_KEY is not set', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(fakeAssessment, fakeCandidates);
    expect(plan.source).toBe('fallback');
  });

  it('returns rankedFixes equal to the input candidates', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(fakeAssessment, fakeCandidates);
    expect(plan.rankedFixes).toEqual(fakeCandidates);
  });

  it('returns a non-empty explainer', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(fakeAssessment, fakeCandidates);
    expect(plan.explainer).toBeTruthy();
    expect(plan.explainer.length).toBeGreaterThan(10);
  });

  it('mentions the fine amount in the explainer when building is over cap', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(fakeAssessment, fakeCandidates);
    expect(plan.explainer).toContain('4,020');
  });
});

describe('generateAdvice (empty candidates)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('returns fallback when candidates is empty', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(fakeAssessment, []);
    expect(plan.source).toBe('fallback');
    expect(plan.rankedFixes).toEqual([]);
  });
});

describe('generateAdvice (mocked AI path)', () => {
  it('returns source:"ai" and preserves candidates numbers when API key is set', async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-mock';

    // Reset modules FIRST, then set up the mock, then import
    vi.resetModules();

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          explainer: 'Your building faces LL97 penalties.',
          boardSummary: 'We recommend heat pumps first.',
          order: ['heat-pump', 'lighting'],
          rationales: [
            { measureKey: 'heat-pump', rationale: 'Best long-term electrification option.' },
            { measureKey: 'lighting', rationale: 'Fastest payback with LED upgrades.' },
          ],
        }),
      }],
    });

    vi.doMock('@anthropic-ai/sdk', () => ({
      default: function MockAnthropic() {
        return { messages: { create: mockCreate } };
      },
    }));

    try {
      const { generateAdvice } = await import('./advise');
      const plan = await generateAdvice(fakeAssessment, fakeCandidates);

      expect(plan.source).toBe('ai');
      // Every candidate appears EXACTLY once — guards the spread-copy identity dedup bug
      // that produced duplicate cards (e.g. 14 fixes for 7 measures) once the AI path went live.
      expect(plan.rankedFixes).toHaveLength(fakeCandidates.length);
      expect(new Set(plan.rankedFixes.map(f => f.measureKey)).size).toBe(fakeCandidates.length);
      // Verify numbers are preserved (not altered by Claude)
      const hpFix = plan.rankedFixes.find(f => f.measureKey === 'heat-pump');
      expect(hpFix).toBeDefined();
      expect(hpFix!.tCO2eReduced).toBe(259);
      expect(hpFix!.fineAvoidedUSD).toBe(4020);
      expect(hpFix!.netCostUSD).toBe(758000);
      // Rationale is prose only
      expect(typeof hpFix!.rationale).toBe('string');
      expect(hpFix!.rationale).toBe('Best long-term electrification option.');
    } finally {
      if (origKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = origKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      vi.resetModules();
    }
  });
});
