import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocode } from './geosearch';
import fixture from '@/test/fixtures/geosearch-120bway.json';

describe('geocode', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }) as any;
  });
  it('returns BBL, BIN and coordinates from the first feature', async () => {
    const r = await geocode('120 Broadway');
    expect(r?.bbl).toBe('1000477501');
    expect(r?.bin).toBe('1001026');
    expect(r?.lon).toBeCloseTo(-74.010, 3);
  });
  it('returns null when there are no features', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }) as any;
    expect(await geocode('nowhere')).toBeNull();
  });
});
