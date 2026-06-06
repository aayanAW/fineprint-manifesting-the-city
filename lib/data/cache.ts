// Local SQLite cache of BuildingFacts so the demo runs offline (venue-wifi-
// proof): read here first, and only hit live Socrata on a miss. Node-only —
// never imported by client components.
//
// Lazy-open with create-table-if-absent; keyed by BBL with last-write-wins.

import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { lookupBuilding as realLookupBuilding } from './lookup';
import type { Bbl, BuildingFacts } from './types';

export type CacheDb = Database.Database;

// Default on-disk cache; scripts/fetch-ll84.ts warms it. Kept out of git.
// Resolved from the project root at runtime (not import.meta.url) so the
// bundler never tries to resolve it as a module asset.
export const DEFAULT_CACHE_PATH = join(process.cwd(), 'data', 'cache', 'll84.sqlite');

export function openCache(path: string = DEFAULT_CACHE_PATH): CacheDb {
  // Ensure the parent directory exists so a first run never ENOENTs.
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(
    `CREATE TABLE IF NOT EXISTS building_facts (
       bbl TEXT PRIMARY KEY,
       json TEXT NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
  );
  return db;
}

export function writeFacts(db: CacheDb, facts: BuildingFacts): void {
  db.prepare(
    `INSERT INTO building_facts (bbl, json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(bbl) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
  ).run(facts.bbl, JSON.stringify(facts), Date.now());
}

export function readFacts(db: CacheDb, bbl: string): BuildingFacts | null {
  const row = db.prepare(`SELECT json FROM building_facts WHERE bbl = ?`).get(bbl) as
    | { json: string }
    | undefined;
  return row ? (JSON.parse(row.json) as BuildingFacts) : null;
}

// Read-through cache: serve a building's facts from SQLite when warm, otherwise
// resolve them through the live pipeline and write them back for next time.
//
// When a BBL is known (e.g. the /api/building route received one), the cache is
// checked BEFORE any network call — the warm path is fully offline. An
// address-only lookup must resolve the BBL first (GeoSearch is the only thing
// that turns an address into a BBL), so it always hits the live resolver, then
// upserts under the resolved BBL so the next BBL-keyed read is a cache hit.
//
// `lookup` is injectable so tests exercise the read-through logic offline.
export interface ReadThroughOptions {
  db?: CacheDb;
  bbl?: Bbl;
  lookup?: (address: string) => Promise<BuildingFacts>;
}

export async function getBuildingFacts(
  address: string,
  options: ReadThroughOptions = {},
): Promise<BuildingFacts> {
  const db = options.db ?? openCache();
  const ownsDb = options.db === undefined;
  const lookup = options.lookup ?? realLookupBuilding;

  try {
    if (options.bbl) {
      const cached = readFacts(db, options.bbl);
      if (cached) {
        return cached;
      }
    }

    const facts = await lookup(address);
    writeFacts(db, facts);
    return facts;
  } finally {
    if (ownsDb) {
      db.close();
    }
  }
}
