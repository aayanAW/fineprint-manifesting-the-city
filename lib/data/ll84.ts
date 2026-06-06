// BBL → building facts via the LL84 benchmarking disclosure dataset
// (Socrata 5zyy-y8am on data.cityofnewyork.us): gross floor area, property
// uses, reported emissions, fuel columns. Returns null when the building has
// no filing — plenty don't, and the orchestrator must degrade honestly.
//
// The one rule: this layer maps and recomputes ONLY through the engine. Use
// names are mapped to ESPM vocabulary via the engine's resolveEspmType; the
// emissions recompute is done by the engine's recomputeEmissions. No emission
// arithmetic lives here.

import { fetchJson } from './http';
import { resolveEspmType } from '@/lib/ll97/constants';
import { recomputeEmissions, type FuelUse } from '@/lib/ll97/emissions';
import type { Bbl, Ll84Facts, UseSplit } from './types';

const LL84_URL = 'https://data.cityofnewyork.us/resource/5zyy-y8am.json';

// LL84 self-reported names versus the penalty rule's factor table
// (1 RCNY §103-14(d)(3), the vocabulary the engine accepts). Verified against a
// dataset-wide sweep of distinct use names, 2026-06-06.
//
// Renames: the same ESPM type under a newer or longer name. Exact mapping,
// nothing to disclose (the engine's resolveEspmType also knows several of
// these; this table covers the LL84-specific long forms).
const LL84_USE_RENAMES: Record<string, string> = {
  'Community Center and Social Meeting Hall': 'Social/Meeting Hall',
  'Senior Living Community': 'Senior Care Community',
  'Vehicle Repair Services': 'Repair Services (Vehicle, Shoe, Locksmith, etc.)',
  'Vehicle Dealership': 'Automobile Dealership',
};

// Proxies: types the rule's table simply doesn't list. Each maps to the nearest
// listed bucket; the mapping is this layer's editorial judgment and is reported
// in Ll84Facts.proxiedUses so the UI can disclose it.
const LL84_USE_PROXIES: Record<string, string> = {
  'Fire Station': 'Other - Public Services',
  'Police Station': 'Other - Public Services',
  'Prison/Incarceration': 'Other - Public Services',
  'Wastewater Treatment Plant': 'Other - Public Services',
  'Fast Food Restaurant': 'Restaurant',
  'Bar/Nightclub': 'Other - Restaurant/Bar',
  Zoo: 'Other - Entertainment/Public Assembly',
  Aquarium: 'Other - Entertainment/Public Assembly',
  'Convention Center': 'Other - Entertainment/Public Assembly',
  'Stadium (Open)': 'Other - Entertainment/Public Assembly',
  'Indoor Arena': 'Other - Entertainment/Public Assembly',
  'Other - Stadium': 'Other - Entertainment/Public Assembly',
  'Ice/Curling Rink': 'Other - Recreation',
  'Heated Swimming Pool': 'Other - Recreation',
  'Electric Vehicle Charging Station': 'Parking',
  'Single-Family Home': 'Other - Lodging/Residential',
  'Veterinary Office': 'Other - Services',
};

// No defensible factor exists for these; they are excluded from the engine's
// input and surfaced in Ll84Facts.unmappedUses instead.
const LL84_USE_UNMAPPABLE = new Set([
  'Other',
  'Not Available',
  'Other - Utility',
  'Energy/Power Station',
  'Drinking Water Treatment & Distribution',
]);

// LL84 fuel columns the engine can price, mapped to recomputeEmissions inputs.
const ELECTRICITY_KWH_COLUMN = 'electricity_use_grid_purchase_1';

// Fuel columns that, if consumed, block the engine's recompute: either the
// statute prices them via coefficients the engine doesn't model (no.1 oil,
// diesel, propane, kerosene), or they have no verified coefficient at all
// (no.5/6 oil, district hot/chilled water, on-site generation). Any positive
// consumption here lists the column in unpriceableFuels and falls back to the
// reported location-based GHG — falling back beats pretending.
const UNPRICEABLE_FUEL_COLUMNS = [
  'fuel_oil_1_use_kbtu',
  'fuel_oil_5_6_use_kbtu',
  'diesel_2_use_kbtu',
  'propane_use_kbtu',
  'kerosene_use_kbtu',
  'district_hot_water_use_kbtu',
  'district_chilled_water_use',
  'electricity_use_generated',
];

interface Ll84Row {
  report_year?: string;
  property_name?: string;
  address_1?: string;
  property_gfa_calculated?: string;
  property_gfa_self_reported?: string;
  list_of_all_property_use?: string;
  total_location_based_ghg?: string;
  natural_gas_use_kbtu?: string;
  fuel_oil_2_use_kbtu?: string;
  fuel_oil_4_use_kbtu?: string;
  district_steam_use_kbtu?: string;
  [fuelColumn: string]: string | undefined;
}

export async function fetchLl84(bbl: Bbl): Promise<Ll84Facts | null> {
  const query = new URLSearchParams({
    nyc_borough_block_and_lot: bbl,
    $order: 'report_year DESC',
    $limit: '10',
  });

  const token = globalThis.process?.env?.SOCRATA_APP_TOKEN;
  if (token) {
    query.set('$$app_token', token);
  }

  const rows = await fetchJson<Ll84Row[]>(`${LL84_URL}?${query}`, { service: 'LL84' });
  return parseLl84Rows(rows, bbl);
}

export function parseLl84Rows(rows: Ll84Row[], bbl: Bbl): Ll84Facts | null {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  // Latest year wins; within a year, campus lots can file parent and child
  // rows, and the parent (largest floor area) is the whole-lot picture.
  const latestFiling = [...rows].sort(
    (a, b) =>
      (parseNumber(b.report_year) ?? 0) - (parseNumber(a.report_year) ?? 0) ||
      (floorArea(b) ?? 0) - (floorArea(a) ?? 0),
  )[0];

  const { mapped, proxied, unmapped } = mapUseList(latestFiling.list_of_all_property_use);
  const { recomputed, unpriceable } = recompute(latestFiling);

  return {
    bbl,
    reportedAddress: latestFiling.property_name ?? latestFiling.address_1 ?? null,
    grossFloorAreaSqft: floorArea(latestFiling),
    occupancyGroups: mapped,
    annualEmissionsTco2e: parseNumber(latestFiling.total_location_based_ghg),
    recomputedEmissionsTco2e: recomputed,
    unpriceableFuels: unpriceable,
    reportingYear: parseNumber(latestFiling.report_year),
    proxiedUses: proxied,
    unmappedUses: unmapped,
  };
}

// Build the engine's FuelUse from the priceable LL84 columns and let the engine
// compute the DOB-basis emissions. Any consumed fuel the engine can't price is
// listed and blocks the recompute (returns null) so we fall back honestly.
function recompute(row: Ll84Row): { recomputed: number | null; unpriceable: string[] } {
  const unpriceable = UNPRICEABLE_FUEL_COLUMNS.filter(
    (column) => (parseNumber(row[column]) ?? 0) > 0,
  );
  if (unpriceable.length > 0) {
    return { recomputed: null, unpriceable };
  }

  const fuel: FuelUse = {
    electricity_kWh: positive(row[ELECTRICITY_KWH_COLUMN]),
    naturalGas_kBtu: positive(row.natural_gas_use_kbtu),
    fuelOil2_kBtu: positive(row.fuel_oil_2_use_kbtu),
    fuelOil4_kBtu: positive(row.fuel_oil_4_use_kbtu),
    districtSteam_kBtu: positive(row.district_steam_use_kbtu),
  };

  // The engine prices the DOB way for 2024-2029; the data layer stores that
  // single basis (the engine recomputes per-period limits downstream).
  const { tco2e } = recomputeEmissions(fuel, '2024-2029');
  if (tco2e === null) {
    return { recomputed: null, unpriceable: [] };
  }
  return { recomputed: Math.round(tco2e * 100) / 100, unpriceable: [] };
}

// undefined when the value is absent, "Not Available", or not positive — so the
// engine never sees a zero/NaN it would treat as real consumption.
function positive(value: string | undefined): number | undefined {
  const n = parseNumber(value);
  return n !== null && n > 0 ? n : undefined;
}

function floorArea(row: Ll84Row): number | null {
  return parseNumber(row.property_gfa_calculated) ?? parseNumber(row.property_gfa_self_reported);
}

// The dataset writes "Not Available" (and friends) instead of leaving a field
// empty. Anything that isn't a clean finite number becomes null.
function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// list_of_all_property_use reads like:
//   "Restaurant (50021.0), Personal Services (Health/Beauty, Dry Cleaning,
//    etc.) (5422.0), Office (2692475.1)"
// Use names can contain commas and parentheses, so the only reliable delimiter
// is the trailing "(<number>)" after each name. Mapping runs renames first,
// then proxies (recorded), then the engine's own resolver as a final exact/
// alias check, and finally falls through to unmapped if nothing resolves.
function mapUseList(useList: string | undefined): {
  mapped: UseSplit[];
  proxied: Array<{ from: string; to: string }>;
  unmapped: UseSplit[];
} {
  const mapped: UseSplit[] = [];
  const proxied: Array<{ from: string; to: string }> = [];
  const unmapped: UseSplit[] = [];

  if (!useList) {
    return { mapped, proxied, unmapped };
  }

  const usePattern = /(.+?)\s\((\d+(?:\.\d+)?)\)(?:,\s|$)/g;
  for (const [, rawName, sqftText] of useList.matchAll(usePattern)) {
    const name = rawName;
    const sqft = Number(sqftText);

    if (LL84_USE_UNMAPPABLE.has(name)) {
      unmapped.push({ group: name, sqft });
      continue;
    }

    const renamed = LL84_USE_RENAMES[name];
    if (renamed) {
      mapped.push({ group: renamed, sqft });
      continue;
    }

    const proxy = LL84_USE_PROXIES[name];
    if (proxy) {
      mapped.push({ group: proxy, sqft });
      proxied.push({ from: name, to: proxy });
      continue;
    }

    // Exact ESPM key or a known engine alias (e.g. "Bar/Nightclub" handled
    // above, "Repair Services" handled by the engine). resolveEspmType returns
    // the canonical key; store that so the engine accepts it directly.
    const resolved = resolveEspmType(name);
    if (resolved) {
      mapped.push({ group: resolved, sqft });
      continue;
    }

    // Nothing resolved — exclude it visibly rather than feed the engine a name
    // it would throw on.
    unmapped.push({ group: name, sqft });
  }

  return { mapped, proxied, unmapped };
}
