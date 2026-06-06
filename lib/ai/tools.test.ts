import { describe, it, expect, vi } from 'vitest';
import { dataToolDefinitions, executeDataTool, type Assessment } from './tools';
import type { BuildingFacts } from '@/lib/data/types';

const facts: BuildingFacts = {
  bbl: '1008350041',
  address: '350 5th Avenue, Manhattan',
  grossFloorAreaSqft: 50000,
  occupancyGroups: [{ group: 'Multifamily Housing', sqft: 50000 }],
  annualEmissionsTco2e: 370,
  isLl97Covered: true,
  isArticle321: false,
  provenance: [],
};

const factsNoEmissions: BuildingFacts = {
  ...facts,
  annualEmissionsTco2e: null,
  occupancyGroups: [],
  grossFloorAreaSqft: null,
};

describe('dataToolDefinitions', () => {
  it('exposes lookup_building and assess_building with an address-only schema', () => {
    const names = dataToolDefinitions.map(t => t.name);
    expect(names).toEqual(['lookup_building', 'assess_building']);
    for (const t of dataToolDefinitions) {
      expect(t.input_schema.required).toEqual(['address']);
      expect(t.input_schema.properties.address.type).toBe('string');
    }
  });
});

describe('executeDataTool routing (injected lookup — offline)', () => {
  it('routes lookup_building to the injected lookup and returns the facts JSON', async () => {
    const lookupBuilding = vi.fn().mockResolvedValue(facts);
    const out = JSON.parse(await executeDataTool('lookup_building', { address: facts.address }, { lookupBuilding }));
    expect(lookupBuilding).toHaveBeenCalledWith(facts.address);
    expect(out.bbl).toBe('1008350041');
  });

  it('routes assess_building through the engine and returns projections for all periods', async () => {
    const lookupBuilding = vi.fn().mockResolvedValue(facts);
    const out: Assessment = JSON.parse(
      await executeDataTool('assess_building', { address: facts.address }, { lookupBuilding }),
    );
    expect(out.note).toBeNull();
    expect(out.projections).not.toBeNull();
    expect(out.projections!.map(p => p.period)).toEqual(['2024-2029', '2030-2034', '2035-2039']);
    // Engine computed the numbers — every projection carries an annualFineUsd field.
    for (const p of out.projections!) {
      expect(typeof p.annualFineUsd).toBe('number');
    }
  });

  it('assess_building degrades honestly when the engine lacks required facts', async () => {
    const lookupBuilding = vi.fn().mockResolvedValue(factsNoEmissions);
    const out: Assessment = JSON.parse(
      await executeDataTool('assess_building', { address: facts.address }, { lookupBuilding }),
    );
    expect(out.projections).toBeNull();
    expect(out.note).toMatch(/annualEmissionsTco2e/);
  });

  it('throws on an unknown tool name', async () => {
    const lookupBuilding = vi.fn().mockResolvedValue(facts);
    await expect(executeDataTool('not_a_tool', { address: facts.address }, { lookupBuilding }))
      .rejects.toThrow(/is not a data tool/);
  });
});
