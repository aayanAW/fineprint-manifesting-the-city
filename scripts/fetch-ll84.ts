// One-time cache warmer. Resolves the demo addresses (or an explicit BBL list)
// through the live pipeline, writes BuildingFacts into the SQLite cache, AND
// dumps each as a committed JSON fixture under test/fixtures/demo/ so the demo
// runs even if the SQLite file is absent or the venue wifi dies.
//
// Run: npm run fetch-ll84            (warms the 3 demo buildings)
//      npm run fetch-ll84 -- 1008350041 1000087501   (explicit BBLs)
//
// Note: requires `tsx` (a devDependency). It is a build-time helper only and is
// never imported by the app or the tests.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lookupBuilding } from '@/lib/data/lookup';
import { getCblEntry } from '@/lib/data/coveredBuildings';
import { openCache, writeFacts } from '@/lib/data/cache';
import type { BuildingFacts } from '@/lib/data/types';

// The demo set: a large municipal/office building, the Empire State Building
// (mixed-use, our golden BBL), and one Article 321 affordable-housing pathway
// building so the affordable path is demoable.
const DEMO_BUILDINGS: Array<{ slug: string; address: string }> = [
  { slug: '1-centre-street', address: '1 Centre Street, Manhattan' },
  { slug: '350-5th-avenue', address: '350 5th Avenue, Manhattan' },
  { slug: '39-whitehall-street', address: '39 Whitehall Street, Manhattan' },
];

const fixtureDir = fileURLToPath(new URL('../test/fixtures/demo/', import.meta.url));

async function resolve(address: string): Promise<BuildingFacts> {
  return lookupBuilding(address);
}

// Fallback when GeoSearch/LL84 are unreachable: build minimal honest facts from
// the committed CBL snapshot alone (covered + Article 321 flag + DOF sqft).
function fromCblOnly(bbl: string, address: string): BuildingFacts | null {
  const cbl = getCblEntry(bbl);
  if (!cbl) return null;
  return {
    bbl,
    address: cbl.address ?? address,
    grossFloorAreaSqft: cbl.sqft,
    occupancyGroups: [],
    annualEmissionsTco2e: null,
    isLl97Covered: cbl.ll97,
    isArticle321: cbl.article321,
    provenance: [
      { field: 'isLl97Covered', source: cbl.source },
      { field: 'isArticle321', source: cbl.source },
    ],
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const db = openCache();
  mkdirSync(fixtureDir, { recursive: true });

  const targets =
    argv.length > 0
      ? argv.map((bbl) => ({ slug: bbl, address: bbl, bbl }))
      : DEMO_BUILDINGS.map((b) => ({ ...b, bbl: undefined as string | undefined }));

  for (const target of targets) {
    try {
      let facts: BuildingFacts | null = null;
      if (target.bbl) {
        facts = fromCblOnly(target.bbl, target.address) ?? null;
        if (!facts) throw new Error(`BBL ${target.bbl} not in CBL snapshot`);
      } else {
        facts = await resolve(target.address);
      }
      writeFacts(db, facts);
      writeFileSync(`${fixtureDir}${target.slug}.json`, JSON.stringify(facts, null, 2) + '\n');
      console.log(`cached ${target.address} → BBL ${facts.bbl}`);
    } catch (err) {
      console.error(`FAILED ${target.address}: ${(err as Error).message}`);
    }
  }

  db.close();
  console.log('done.');
}

main();
