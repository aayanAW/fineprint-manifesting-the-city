export interface GeoResult { bbl: string; bin?: string; label: string; lat?: number; lon?: number; }

const BASE = 'https://geosearch.planninglabs.nyc/v2/search';

/** Geocode a NYC address to its BBL via the keyless GeoSearch API. */
export async function geocode(address: string): Promise<GeoResult | null> {
  const res = await fetch(`${BASE}?text=${encodeURIComponent(address)}&size=1`);
  if (!res.ok) throw new Error(`GeoSearch ${res.status}`);
  const data = await res.json();
  const f = data.features?.[0];
  const bbl = f?.properties?.addendum?.pad?.bbl;
  if (!f || !bbl) return null;
  const [lon, lat] = f.geometry?.coordinates ?? [];
  return { bbl: String(bbl), bin: f.properties.addendum.pad.bin ? String(f.properties.addendum.pad.bin) : undefined, label: f.properties.label, lat, lon };
}
