import { describe, expect, it } from 'vitest';
import { lookupBuilding, type LookupSources } from './lookup';
import type { BblResult, CblEntry, Ll84Facts } from './types';

// The orchestrator is tested with injected stand-ins for the three sources so
// the suite runs fully offline; each source has its own fixture-backed tests.
const candidate = (bbl: string, addr: string, borough = 'Manhattan'): BblResult => ({
  bbl,
  normalizedAddress: addr,
  borough,
});

const ll84 = (over: Partial<Ll84Facts> = {}): Ll84Facts => ({
  bbl: '1008350041',
  reportedAddress: 'ESRT - Empire State Building',
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [
    { group: 'Office', sqft: 2_692_475.1 },
    { group: 'Restaurant', sqft: 50_021 },
  ],
  annualEmissionsTco2e: 16_678.22,
  recomputedEmissionsTco2e: 12_096.78,
  unpriceableFuels: [],
  reportingYear: 2024,
  proxiedUses: [],
  unmappedUses: [],
  ...over,
});

const cbl = (over: Partial<CblEntry> = {}): CblEntry => ({
  bbl: '1008350041',
  ll97: true,
  article321: false,
  sqft: 2_812_739,
  address: '338 5 AVENUE',
  source: 'DOB Sustainability Covered Buildings List, Filing Year 2026',
  ...over,
});

const fakeSources = (overrides: Partial<LookupSources> = {}): LookupSources => ({
  lookupBblCandidates: async () => [candidate('1008350041', '350 5 AVENUE, New York, NY, USA')],
  fetchLl84: async () => ll84(),
  getCblEntry: () => cbl(),
  ...overrides,
});

describe('lookupBuilding', () => {
  it('assembles BuildingFacts and prefers the DOB-basis recomputed emissions', async () => {
    const facts = await lookupBuilding('350 5th Avenue, Manhattan', fakeSources());
    expect(facts.bbl).toBe('1008350041');
    expect(facts.address).toBe('350 5 AVENUE, New York, NY, USA');
    expect(facts.grossFloorAreaSqft).toBe(2_852_257);
    expect(facts.occupancyGroups).toHaveLength(2);
    expect(facts.annualEmissionsTco2e).toBe(12_096.78); // recomputed wins over reported
    expect(facts.isLl97Covered).toBe(true);
    expect(facts.isArticle321).toBe(false);
    const emissionsNote = facts.provenance.find((p) => p.field === 'annualEmissionsTco2e');
    expect(emissionsNote?.detail).toMatch(/28-320\.3\.1\.1/);
  });

  it('falls back to reported location-based GHG when the recompute is blocked', async () => {
    const facts = await lookupBuilding(
      '350 5th Avenue, Manhattan',
      fakeSources({
        fetchLl84: async () =>
          ll84({ recomputedEmissionsTco2e: null, unpriceableFuels: ['fuel_oil_5_6_use_kbtu'] }),
      }),
    );
    expect(facts.annualEmissionsTco2e).toBe(16_678.22);
    const emissionsNote = facts.provenance.find((p) => p.field === 'annualEmissionsTco2e');
    expect(emissionsNote?.detail).toMatch(/location-based/i);
    expect(emissionsNote?.detail).toMatch(/fuel_oil_5_6/);
  });

  it('DOF-aware: among same-house-number candidates, prefers the one the CBL knows', async () => {
    const facts = await lookupBuilding(
      '1 Pike Street, Manhattan',
      fakeSources({
        // top pick (BBL A) is unknown to DOF; second (BBL B) shares house number & is covered.
        lookupBblCandidates: async () => [
          candidate('1AAAAAAAAA', '1 PIKE STREET, New York, NY, USA'),
          candidate('1BBBBBBBBB', '1 PIKE ST., New York, NY, USA'),
        ],
        fetchLl84: async () => null,
        getCblEntry: (bbl) => (bbl === '1BBBBBBBBB' ? cbl({ bbl: '1BBBBBBBBB' }) : null),
      }),
    );
    expect(facts.bbl).toBe('1BBBBBBBBB');
    const bblNote = facts.provenance.find((p) => p.field === 'bbl');
    expect(bblNote?.detail).toMatch(/covered buildings list/i);
  });

  it('never crosses house numbers: "1 Pike" stays "1 Pike" even if "51 Pike" is covered', async () => {
    const facts = await lookupBuilding(
      '1 Pike Street, Manhattan',
      fakeSources({
        lookupBblCandidates: async () => [
          candidate('1AAAAAAAAA', '1 PIKE STREET, New York, NY, USA'),
          candidate('1CCCCCCCCC', '51 PIKE STREET, New York, NY, USA'),
        ],
        fetchLl84: async () => null,
        getCblEntry: (bbl) => (bbl === '1CCCCCCCCC' ? cbl({ bbl: '1CCCCCCCCC' }) : null),
      }),
    );
    expect(facts.bbl).toBe('1AAAAAAAAA'); // stays with the queried house number
  });

  it('degrades honestly when there is no LL84 filing (DOF sqft fallback, empty uses)', async () => {
    const facts = await lookupBuilding(
      '350 5th Avenue, Manhattan',
      fakeSources({ fetchLl84: async () => null }),
    );
    expect(facts.annualEmissionsTco2e).toBeNull();
    expect(facts.occupancyGroups).toEqual([]);
    expect(facts.grossFloorAreaSqft).toBe(2_812_739); // falls back to DOF sqft
    const noteText = facts.provenance.map((p) => p.detail ?? '').join(' ');
    expect(noteText).toMatch(/no LL84 filing/i);
  });

  it('surfaces proxied and unmapped uses in provenance', async () => {
    const facts = await lookupBuilding(
      '1 Firehouse Plaza, Manhattan',
      fakeSources({
        fetchLl84: async () =>
          ll84({
            occupancyGroups: [{ group: 'Other - Public Services', sqft: 12_000 }],
            proxiedUses: [{ from: 'Fire Station', to: 'Other - Public Services' }],
            unmappedUses: [{ group: 'Other', sqft: 3_000 }],
          }),
      }),
    );
    const noteText = facts.provenance.map((p) => p.detail ?? '').join(' | ');
    expect(noteText).toMatch(/Fire Station.*Other - Public Services/);
    expect(noteText).toMatch(/3,000 sqft.*excluded/);
  });

  it('a building absent from the covered buildings list is not covered', async () => {
    const facts = await lookupBuilding(
      '350 5th Avenue, Manhattan',
      fakeSources({ getCblEntry: () => null }),
    );
    expect(facts.isLl97Covered).toBe(false);
    expect(facts.isArticle321).toBe(false);
  });

  it('every populated field names its source', async () => {
    const facts = await lookupBuilding('350 5th Avenue, Manhattan', fakeSources());
    const fields = facts.provenance.map((p) => p.field);
    expect(fields).toContain('bbl');
    expect(fields).toContain('grossFloorAreaSqft');
    expect(fields).toContain('annualEmissionsTco2e');
    expect(fields).toContain('isLl97Covered');
  });

  it('propagates GeoSearch errors for an unresolvable address', async () => {
    const sources = fakeSources({
      lookupBblCandidates: async () => {
        throw new Error('no NYC address found for "nowhere"');
      },
    });
    await expect(lookupBuilding('nowhere', sources)).rejects.toThrow(/no NYC address found/);
  });
});
