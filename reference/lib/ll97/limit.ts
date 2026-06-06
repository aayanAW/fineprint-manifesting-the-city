import { EMISSIONS_FACTORS, PROPERTY_TYPE_ALIASES, Period } from './coefficients';

export interface SpaceUse { type: string; gfa: number; }

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/\([^)]*\)/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Build a normalized index per period once. Folds in the alias table under normalized keys so an
// alias resolves even when the live LL84 label differs in case/whitespace/punctuation (e.g.
// 'senior living community', 'Vehicle Dealership ', 'bar/nightclub'). Without this, a case/space
// variant of an alias key falls through to undefined and silently drops the use-type from the cap.
const NORM_INDEX: Record<string, Record<string, number>> = {};
function normIndex(period: Period): Record<string, number> {
  if (!NORM_INDEX[period]) {
    const idx: Record<string, number> = {};
    for (const [k, v] of Object.entries(EMISSIONS_FACTORS[period])) idx[norm(k)] = v;
    for (const [aliasKey, canonical] of Object.entries(PROPERTY_TYPE_ALIASES)) {
      const f = EMISSIONS_FACTORS[period][canonical];
      const nk = norm(aliasKey);
      if (f !== undefined && idx[nk] === undefined) idx[nk] = f;
    }
    NORM_INDEX[period] = idx;
  }
  return NORM_INDEX[period];
}

/** Resolve a property-type label to its emissions factor (exact -> alias -> normalized). */
export function factorFor(type: string, period: Period): number | undefined {
  const direct = EMISSIONS_FACTORS[period][type];
  if (direct !== undefined) return direct;
  const alias = PROPERTY_TYPE_ALIASES[type];
  if (alias && EMISSIONS_FACTORS[period][alias] !== undefined) return EMISSIONS_FACTORS[period][alias];
  return normIndex(period)[norm(type)];
}

/** GHG emissions limit (tCO2e) = sum over space-use types of GFA * factor. */
export function computeLimit(uses: SpaceUse[], period: Period): number {
  return uses.reduce((sum, u) => {
    const f = factorFor(u.type, period);
    if (f === undefined) return sum; // unknown type contributes 0; caller flags it
    return sum + u.gfa * f;
  }, 0);
}

/** Types with positive GFA that do not resolve to a factor in the given period. */
export function unresolvedTypes(uses: SpaceUse[], period: Period): string[] {
  return uses.filter(u => u.gfa > 0 && factorFor(u.type, period) === undefined).map(u => u.type);
}
