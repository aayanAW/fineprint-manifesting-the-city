import { afterEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBuildingFacts, openCache, readFacts, writeFacts } from './cache';
import type { BuildingFacts } from './types';

const dbPath = join(tmpdir(), `fineprint-cache-test-${process.pid}.sqlite`);

const sample: BuildingFacts = {
  bbl: '1008350041',
  address: '350 5 AVENUE, New York',
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: 'Office', sqft: 2_692_475.1 }],
  annualEmissionsTco2e: 12_096.78,
  isLl97Covered: true,
  isArticle321: false,
  provenance: [{ field: 'bbl', source: 'NYC GeoSearch' }],
};

afterEach(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + suffix);
    } catch {
      /* ignore */
    }
  }
});

describe('SQLite building-facts cache', () => {
  it('round-trips BuildingFacts by BBL', () => {
    const db = openCache(dbPath);
    writeFacts(db, sample);
    const got = readFacts(db, '1008350041');
    expect(got).toEqual(sample);
    db.close();
  });

  it('returns null on a cache miss', () => {
    const db = openCache(dbPath);
    expect(readFacts(db, '9999999999')).toBeNull();
    db.close();
  });

  it('upserts (latest write wins) on the same BBL', () => {
    const db = openCache(dbPath);
    writeFacts(db, sample);
    writeFacts(db, { ...sample, annualEmissionsTco2e: 1.0 });
    expect(readFacts(db, '1008350041')?.annualEmissionsTco2e).toBe(1.0);
    db.close();
  });

  it('creates the table lazily if absent and survives reopen', () => {
    const db1 = openCache(dbPath);
    writeFacts(db1, sample);
    db1.close();
    const db2 = openCache(dbPath); // reopen; table already exists
    expect(readFacts(db2, '1008350041')?.bbl).toBe('1008350041');
    db2.close();
  });
});

describe('read-through cache (getBuildingFacts)', () => {
  it('serves a known BBL from cache without touching the live lookup', async () => {
    const db = openCache(dbPath);
    writeFacts(db, sample);
    const lookup = vi.fn(async () => {
      throw new Error('live lookup must not run on a warm cache hit');
    });

    const got = await getBuildingFacts('350 5th Avenue, Manhattan', {
      db,
      bbl: '1008350041',
      lookup,
    });

    expect(got).toEqual(sample);
    expect(lookup).not.toHaveBeenCalled();
    db.close();
  });

  it('falls through to the live lookup on a miss and writes the result back', async () => {
    const db = openCache(dbPath);
    const lookup = vi.fn(async () => sample);

    const got = await getBuildingFacts('350 5th Avenue, Manhattan', {
      db,
      bbl: '1008350041',
      lookup,
    });

    expect(got).toEqual(sample);
    expect(lookup).toHaveBeenCalledTimes(1);
    // Written back: a subsequent BBL-keyed read is now a hit.
    expect(readFacts(db, '1008350041')).toEqual(sample);
    db.close();
  });

  it('an address-only request resolves live, then warms the cache by BBL', async () => {
    const db = openCache(dbPath);
    const lookup = vi.fn(async () => sample);

    await getBuildingFacts('350 5th Avenue, Manhattan', { db, lookup });
    expect(lookup).toHaveBeenCalledTimes(1);

    // Now that the BBL is warm, a BBL-keyed read serves from cache.
    const second = await getBuildingFacts('350 5th Avenue, Manhattan', {
      db,
      bbl: sample.bbl,
      lookup,
    });
    expect(second).toEqual(sample);
    expect(lookup).toHaveBeenCalledTimes(1); // not called again
    db.close();
  });
});
