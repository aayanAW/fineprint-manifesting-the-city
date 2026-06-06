import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBenchmarking } from './benchmarking';
import fixture from '@/test/fixtures/benchmarking-pelham.json';
import mixed from '@/test/fixtures/benchmarking-mixeduse.json';
import partialGfa from '@/test/fixtures/benchmarking-partial-gfa.json';

describe('fetchBenchmarking', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }) as any;
  });
  it('maps SODA fields into typed numbers', async () => {
    const r = await fetchBenchmarking('2042500026');
    expect(r?.gfa).toBe(52941);
    expect(r?.primaryType).toBe('Multifamily Housing');
    expect(r?.energy.reportedGHG_tCO2e).toBeCloseTo(216.1, 1);
    expect(r?.energy.electricity_kWh).toBe(1200000);
    expect(r?.energy.naturalGas_therms).toBe(30000);
  });
  it('returns null when no rows match the BBL', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as any;
    expect(await fetchBenchmarking('0000000000')).toBeNull();
  });
  it('parses up to 3 use types and maps district steam', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mixed }) as any;
    const r = await fetchBenchmarking('1000010001');
    expect(r?.useTypes).toHaveLength(2);
    expect(r?.useTypes[1]).toEqual({ type: 'Retail Store', gfa: 30000 });
    expect(r?.energy.districtSteam_kBtu).toBe(2000000);
    expect(r?.flags).toContain('unmapped-fuel-undercount');
  });
  it('rejects a non-10-digit BBL (SoQL guard)', async () => {
    expect(await fetchBenchmarking("123'; DROP")).toBeNull();
  });
  it('back-fills residual GFA when itemized use types cover less than 98% of total', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => partialGfa }) as any;
    const r = await fetchBenchmarking('1000020002');
    expect(r).not.toBeNull();
    const totalItemized = r!.useTypes.reduce((s, u) => s + u.gfa, 0);
    expect(totalItemized).toBe(100000);
    expect(r!.flags).toContain('partial-gfa-coverage');
  });
});
