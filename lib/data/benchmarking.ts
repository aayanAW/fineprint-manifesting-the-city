import type { SpaceUse } from '@/lib/ll97/limit';

const DATASET = '5zyy-y8am';
const BASE = `https://data.cityofnewyork.us/resource/${DATASET}.json`;

export interface BenchmarkingRow {
  bbl: string; bin?: string; address: string; reportYear: number; gfa: number;
  primaryType: string; useTypes: SpaceUse[];
  energy: {
    reportedGHG_tCO2e?: number; electricity_kWh?: number; naturalGas_therms?: number;
    fuelOil2_kBtu?: number; fuelOil4_kBtu?: number; districtSteam_kBtu?: number;
  };
  flags: string[];
}

const num = (v: unknown): number | undefined => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

/** Fetch the most recent LL84 benchmarking row for a BBL and map it to typed fields. */
export async function fetchBenchmarking(bbl: string): Promise<BenchmarkingRow | null> {
  if (!/^\d{10}$/.test(bbl)) return null;                          // BBL is 10 digits; guards SoQL injection
  const token = process.env.NYC_APP_TOKEN ? `&$$app_token=${encodeURIComponent(process.env.NYC_APP_TOKEN)}` : '';
  const url = `${BASE}?$where=nyc_borough_block_and_lot='${bbl}'&$order=report_year DESC&$limit=1${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SODA ${res.status}`);
  const rows = await res.json();
  const r = rows?.[0];
  if (!r) return null;

  const gfa = num(r.property_gfa_self_reported) ?? num(r.property_gfa_calculated) ?? 0;
  const primaryType = r.primary_property_type ?? r.largest_property_use_type ?? 'Multifamily Housing';

  const useTypes: SpaceUse[] = [];
  const addUse = (tKey: string, gKey: string) => {
    const t = r[tKey]; const g = num(r[gKey]);
    if (typeof t === 'string' && t.trim() && g && g > 0) useTypes.push({ type: t, gfa: g });
  };
  addUse('largest_property_use_type', 'largest_property_use_type_1');
  addUse('_2nd_largest_property_use', '_2nd_largest_property_use_1');
  addUse('_3rd_largest_property_use', '_3rd_largest_property_use_1');
  if (useTypes.length === 0) useTypes.push({ type: primaryType, gfa });

  const flags: string[] = [];
  // Itemized use GFAs often sum below the building's total — back-fill the remainder as primary type.
  const itemized = useTypes.reduce((s, u) => s + u.gfa, 0);
  if (gfa > 0 && itemized < gfa * 0.98) {
    useTypes.push({ type: primaryType, gfa: gfa - itemized });
    flags.push('partial-gfa-coverage');
  }

  const naturalGas_therms = num(r.natural_gas_weather_normalized)
    ?? num(r.natural_gas_use_therms_)
    ?? (num(r.natural_gas_use_kbtu) != null ? (num(r.natural_gas_use_kbtu) as number) / 100 : undefined);

  if ((num(r.fuel_oil_1_use_kbtu) ?? 0) > 0 || (num(r.fuel_oil_5_6_use_kbtu) ?? 0) > 0) flags.push('unmapped-fuel-undercount');

  return {
    bbl, bin: r.nyc_building_identification ? String(r.nyc_building_identification) : undefined,
    address: r.address_1 ?? '', reportYear: num(r.report_year) ?? 0, gfa, primaryType, useTypes,
    energy: {
      reportedGHG_tCO2e: num(r.total_location_based_ghg),
      electricity_kWh: num(r.electricity_weather_normalized),
      naturalGas_therms,
      fuelOil2_kBtu: num(r.fuel_oil_2_use_kbtu),
      fuelOil4_kBtu: num(r.fuel_oil_4_use_kbtu),
      districtSteam_kBtu: num(r.district_steam_use_kbtu),
    },
    flags,
  };
}
