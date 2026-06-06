// LL97 applicability and the Article 321 flag, answered from DOB's Covered
// Buildings List — the authoritative annual list, not a square-footage guess.
// A committed gzipped snapshot (data/cbl/cbl26.json.gz, ~29k covered BBLs) is
// the data; this loader is remade.
//
// LL97 compliance pathway 3 means the building is subject to Article 321, so
// the snapshot also answers the affordable-housing flag — no separate HPD
// lookup needed.
//
// Node-only (reads the snapshot from disk). The browser never imports this.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Bbl, CblEntry } from './types';

interface CblSnapshot {
  source: string;
  buildings: Record<
    string,
    {
      ll97: boolean;
      cp: number[];
      ll84: boolean;
      ll87: boolean;
      ll88: boolean;
      gsf: number | null;
      addr: string | null;
    }
  >;
}

const ARTICLE_321_PATHWAY = 3;

let cachedSnapshot: CblSnapshot | null = null;

function loadSnapshot(): CblSnapshot {
  if (!cachedSnapshot) {
    // Resolved from the project root at runtime (not import.meta.url) so the
    // bundler never treats the snapshot as a module asset.
    const gzipped = readFileSync(join(process.cwd(), 'data', 'cbl', 'cbl26.json.gz'));
    cachedSnapshot = JSON.parse(gunzipSync(gzipped).toString('utf8')) as CblSnapshot;
  }
  return cachedSnapshot;
}

// Null means the BBL is absent from the list — not covered, or not a building
// DOB knows about.
export function getCblEntry(bbl: Bbl): CblEntry | null {
  const snapshot = loadSnapshot();
  const raw = snapshot.buildings[bbl];
  if (!raw) {
    return null;
  }
  return {
    bbl,
    ll97: raw.ll97,
    article321: raw.cp.includes(ARTICLE_321_PATHWAY),
    sqft: raw.gsf,
    address: raw.addr,
    source: snapshot.source,
  };
}

export function isLl97Covered(bbl: Bbl): boolean {
  return getCblEntry(bbl)?.ll97 ?? false;
}
