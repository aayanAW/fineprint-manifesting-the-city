// Address → BBL via NYC GeoSearch (Pelias). Free, no API key.
// https://geosearch.planninglabs.nyc/v2/search?text=<address>
//
// The BBL lives at properties.addendum.pad.bbl. Same street names exist in
// several boroughs (350 5th Ave is both Midtown and Park Slope), so callers
// should include the borough in the query text. We return all ranked
// candidates so the orchestrator can cross-check against the Covered Buildings
// List — GeoSearch's top pick is sometimes a different tax lot than DOF files
// under (see "1 Pike Street").

import { fetchJson } from './http';
import type { BblResult } from './types';

const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/search';

interface GeoSearchResponse {
  features: Array<{
    properties: {
      label?: string;
      borough?: string;
      addendum?: { pad?: { bbl?: string } };
    };
  }>;
}

export async function lookupBblCandidates(address: string): Promise<BblResult[]> {
  const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(address)}`;
  const response = await fetchJson<GeoSearchResponse>(url, { service: 'GeoSearch' });
  return parseBblCandidates(response, address);
}

// All ranked candidates, de-duplicated by BBL, skipping BBL-less features.
// Ranking is preserved (GeoSearch already sorts by relevance). Throws clearly
// when nothing matched — never invents a BBL.
export function parseBblCandidates(
  response: GeoSearchResponse,
  queriedAddress: string,
): BblResult[] {
  const candidates: BblResult[] = [];
  const seenBbls = new Set<string>();

  for (const feature of response.features ?? []) {
    const bbl = feature.properties.addendum?.pad?.bbl;
    if (!bbl || seenBbls.has(bbl)) {
      continue;
    }
    seenBbls.add(bbl);
    candidates.push({
      bbl,
      normalizedAddress: feature.properties.label ?? queriedAddress,
      borough: feature.properties.borough ?? 'unknown',
    });
  }

  if (candidates.length === 0) {
    throw new Error(`no NYC address found for "${queriedAddress}"`);
  }

  return candidates;
}
