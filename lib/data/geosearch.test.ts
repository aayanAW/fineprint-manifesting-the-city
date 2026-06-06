import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBblCandidates } from './geosearch';

// Real GeoSearch responses recorded 2026-06-06:
// https://geosearch.planninglabs.nyc/v2/search?text=350 5th Avenue, Manhattan
// Manhattan's 350 5th Ave (Empire State Building, BBL 1008350041) ranks first;
// Brooklyn's 350 5th Ave appears further down. Tested OFFLINE.
const fifthAve = JSON.parse(
  readFileSync(new URL('../../test/fixtures/geosearch-350-5th-ave.json', import.meta.url), 'utf8'),
);
const noMatch = JSON.parse(
  readFileSync(new URL('../../test/fixtures/geosearch-no-match.json', import.meta.url), 'utf8'),
);

describe('parseBblCandidates', () => {
  it('returns ranked, de-duplicated BBL candidates', () => {
    const candidates = parseBblCandidates(fifthAve, '350 5th Avenue, Manhattan');
    expect(candidates[0].bbl).toBe('1008350041');
    expect(candidates[0].borough).toBe('Manhattan');
    // 350 5 Ave also exists in Brooklyn — both boroughs must survive.
    expect(candidates.some((c) => c.bbl === '3009810111')).toBe(true);
    expect(candidates.some((c) => c.borough === 'Brooklyn')).toBe(true);
    // de-duped: no BBL appears twice.
    expect(new Set(candidates.map((c) => c.bbl)).size).toBe(candidates.length);
  });

  it('throws when no NYC address matched, rather than inventing one', () => {
    expect(() => parseBblCandidates(noMatch, 'zzzzz nowhere street xyzzy')).toThrow(
      /no NYC address found.*zzzzz nowhere street xyzzy/i,
    );
  });

  it('skips BBL-less features instead of fabricating a BBL', () => {
    const stripped = structuredClone(fifthAve);
    for (const feature of stripped.features) {
      delete feature.properties.addendum;
    }
    expect(() => parseBblCandidates(stripped, '350 5th Avenue, Manhattan')).toThrow(
      /no NYC address found/i,
    );
  });
});
