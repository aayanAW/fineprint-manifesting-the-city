import { PENALTY_USD_PER_TON } from './coefficients';

export interface Fine { excess_tCO2e: number; annual_usd: number; }

/** Annual LL97 penalty = max(0, emissions - limit) * $268. */
export function computeFine(emissions: number, limit: number): Fine {
  const excess = Math.max(0, emissions - limit);
  return { excess_tCO2e: excess, annual_usd: excess * PENALTY_USD_PER_TON };
}
