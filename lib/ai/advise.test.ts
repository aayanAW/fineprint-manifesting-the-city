import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeRanking } from './advise';
import type { FixCandidate } from '@/lib/advise/roi';
import type { BuildingFacts } from '@/lib/data/types';
import type { FineResult } from '@/lib/ll97/engine';

const mk = (measureKey: string): FixCandidate => ({
  measureKey,
  measure: measureKey,
  tCO2eReduced: 10,
  grossCostUSD: null,
  matchedRebates: [],
  netCostUSD: null,
  paybackYears: null,
  fineAvoidedUSD: 100,
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

const facts: BuildingFacts = {
  bbl: '1234567890',
  address: '123 Test St, New York, NY 10001',
  grossFloorAreaSqft: 50000,
  occupancyGroups: [{ group: 'Multifamily Housing', sqft: 50000 }],
  annualEmissionsTco2e: 370,
  isLl97Covered: true,
  isArticle321: false,
  provenance: [],
};

const fines: FineResult[] = [
  {
    period: '2024-2029',
    emissionsLimitTco2e: 337.5,
    actualEmissionsTco2e: 370,
    overageTco2e: 32.5,
    annualFineUsd: 8710,
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
  {
    period: '2030-2034',
    emissionsLimitTco2e: 167.33,
    actualEmissionsTco2e: 370,
    overageTco2e: 202.67,
    annualFineUsd: 54315.56,
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
];

const candidates: FixCandidate[] = [
  {
    measureKey: 'heat-pump',
    measure: 'Heat Pump System',
    tCO2eReduced: 259,
    grossCostUSD: 770000,
    matchedRebates: [
      { name: 'NYS Clean Heat', amount: '$5,000–$12,000 per system', amountShort: 'up to $12k/unit', url: 'https://cleanheat.ny.gov' },
    ],
    netCostUSD: 758000,
    paybackYears: 13.95,
    fineAvoidedUSD: 54315.56,
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
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey; });

  it('returns source:"fallback" when ANTHROPIC_API_KEY is not set', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(facts, fines, candidates);
    expect(plan.source).toBe('fallback');
  });

  it('returns rankedFixes equal to the input candidates (numbers untouched)', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(facts, fines, candidates);
    expect(plan.rankedFixes).toEqual(candidates);
  });

  it('returns a non-empty explainer mentioning the 2030 plan-period fine', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(facts, fines, candidates);
    expect(plan.explainer.length).toBeGreaterThan(10);
    expect(plan.explainer).toContain('54,316'); // rounded 2030-2034 fine
    expect(plan.planPeriodFineUSD).toBe(54316);
  });

  it('returns fallback with empty rankedFixes when candidates is empty', async () => {
    const { generateAdvice } = await import('./advise');
    const plan = await generateAdvice(facts, fines, []);
    expect(plan.source).toBe('fallback');
    expect(plan.rankedFixes).toEqual([]);
  });
});

describe('generateAdvice (mocked AI path — offline)', () => {
  it('returns source:"ai", reorders by measureKey, and preserves every number verbatim', async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-mock';

    vi.resetModules();

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          explainer: 'Your building faces LL97 penalties that spike in 2030.',
          boardSummary: 'We recommend heat pumps first, then lighting.',
          // Order reversed vs. input to prove the AI controls ordering.
          order: ['lighting', 'heat-pump'],
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
      const plan = await generateAdvice(facts, fines, candidates);

      expect(plan.source).toBe('ai');
      expect(mockCreate).toHaveBeenCalledOnce();

      // Each candidate appears EXACTLY once — guards the spread-copy identity dedup bug.
      expect(plan.rankedFixes).toHaveLength(candidates.length);
      expect(new Set(plan.rankedFixes.map(f => f.measureKey)).size).toBe(candidates.length);

      // AI ordering is honored.
      expect(plan.rankedFixes.map(f => f.measureKey)).toEqual(['lighting', 'heat-pump']);

      // Numbers are preserved verbatim (Claude never altered them).
      const hp = plan.rankedFixes.find(f => f.measureKey === 'heat-pump')!;
      expect(hp.tCO2eReduced).toBe(259);
      expect(hp.fineAvoidedUSD).toBe(54315.56);
      expect(hp.netCostUSD).toBe(758000);
      expect(hp.grossCostUSD).toBe(770000);
      expect(hp.paybackYears).toBe(13.95);
      expect(hp.matchedRebates).toEqual(candidates[0].matchedRebates);

      // Rationale is prose only.
      expect(hp.rationale).toBe('Best long-term electrification option.');
      expect(plan.explainer).toBe('Your building faces LL97 penalties that spike in 2030.');
    } finally {
      if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
      else delete process.env.ANTHROPIC_API_KEY;
      vi.resetModules();
    }
  });
});
