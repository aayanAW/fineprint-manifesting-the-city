import type { BuildingAssessment, Period } from '@/types/assessment';
import type { Measure, RebateProgram, FixCandidate, MatchedRebate } from '@/types/advise';
import { PENALTY_USD_PER_TON } from '@/lib/ll97/coefficients';

const AVG_UNIT_SQFT = 900; // rough NYC apartment size, for unit-count estimate

export function buildingFuels(a: BuildingAssessment): string[] {
  const e = a.energy; const fuels: string[] = [];
  if ((e.naturalGas_therms ?? 0) > 0) fuels.push('gas');
  if ((e.fuelOil2_kBtu ?? 0) > 0 || (e.fuelOil4_kBtu ?? 0) > 0) fuels.push('oil');
  if ((e.districtSteam_kBtu ?? 0) > 0) fuels.push('steam');
  if ((e.electricity_kWh ?? 0) > 0) fuels.push('electric');
  return fuels;
}

function applies(m: Measure, fuels: string[]): boolean {
  return m.appliesToFuel.includes('any') || m.appliesToFuel.some(f => fuels.includes(f));
}

function compactRebateAmount(r: RebateProgram): string {
  const n = r.amountNumericMaxUSD;
  if (n == null) return /free|advisor/i.test(`${r.name} ${r.amount}`) ? 'free' : 'varies';
  const d = n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  return `up to ${d}/unit`;
}

// Income-restricted programs: only valid when the building is affordable/rent-regulated.
// Gated on an explicit data field, not a prose regex (see RebateProgram.incomeRestricted).
const isAffordableOnly = (r: RebateProgram) => r.incomeRestricted === true;
// Cash rebates for net-cost math: a positive as-of-right cash amount. Excludes tax
// deductions/credits (cashEligible:false) and competitive/demonstration grants (asOfRight:false).
const isCash = (r: RebateProgram) =>
  (r.amountNumericMaxUSD ?? 0) > 0 && r.cashEligible !== false && r.asOfRight !== false;

/**
 * Build ranked retrofit candidates. Every number is code-computed.
 * Net cost uses a SINGLE best per-unit cash rebate (programs are largely mutually exclusive),
 * scaled by the same unit count as gross cost. Affordable buildings unlock income-restricted programs.
 */
export function computeCandidateFixes(
  a: BuildingAssessment, measures: Measure[], rebates: RebateProgram[],
  period: Period = '2024-2029', affordable = false,
): FixCandidate[] {
  const fuels = buildingFuels(a);
  const emissions = a.emissions.byPeriod[period] ?? 0;
  // tCO2e the building is actually over its cap by, this period. Avoided fine is bounded by
  // the excess a measure removes — NOT by the raw fine — so each measure's avoided fine is
  // an honest standalone figure (they are not additive across measures).
  const excess_tCO2e = a.fines[period]?.excess_tCO2e ?? 0;
  // Negative/zero/missing GFA can't yield a defensible unit count; null out unit-scaled costs
  // (assess.ts already raises a 'missing-gfa' flag for this case).
  const validGfa = a.building.gfa > 0 ? a.building.gfa : null;
  const units = validGfa != null ? Math.max(1, Math.round(validGfa / AVG_UNIT_SQFT)) : null;
  const isMultifamily = a.building.primaryType.toLowerCase().includes('multifamily');

  const candidates: FixCandidate[] = measures.filter(m => applies(m, fuels)).map(m => {
    const midPct = (m.emissionsReductionPctLow + m.emissionsReductionPctHigh) / 2;
    const tCO2eReduced = emissions * (midPct / 100);
    const fineAvoidedUSD = Math.min(tCO2eReduced, excess_tCO2e) * PENALTY_USD_PER_TON;

    // Programs applicable to THIS building + measure. Exclude wrong tenure and income-restricted-when-market-rate.
    const matched = rebates.filter(r =>
      r.status !== 'expired' &&
      r.measures.includes(m.key) &&
      r.appliesToMultifamily === isMultifamily &&
      (affordable || !isAffordableOnly(r)));
    const matchedRebates: MatchedRebate[] = matched.map(r => ({ name: r.name, amount: r.amount, amountShort: compactRebateAmount(r), url: r.url }));

    // Single best per-unit cash rebate (NOT a sum), scaled by units to match gross cost's unit scale.
    const bestPerUnitRebate = matched.filter(isCash).reduce((mx, r) => Math.max(mx, r.amountNumericMaxUSD ?? 0), 0);
    const grossCostUSD = (units != null && m.typicalCostPerUnitUSDMax != null) ? m.typicalCostPerUnitUSDMax * units : null;
    const rebateValueUSD = units != null ? bestPerUnitRebate * units : 0;
    const netCostUSD = grossCostUSD != null ? Math.max(0, grossCostUSD - rebateValueUSD) : null;
    const paybackYears = netCostUSD != null && fineAvoidedUSD > 0 ? netCostUSD / fineAvoidedUSD : null;

    return { measureKey: m.key, measure: m.name, tCO2eReduced, grossCostUSD, matchedRebates, netCostUSD, paybackYears, fineAvoidedUSD };
  });

  return candidates.sort((x, y) => {
    const px = x.paybackYears ?? Infinity, py = y.paybackYears ?? Infinity;
    if (px !== py) return px - py;
    return y.fineAvoidedUSD - x.fineAvoidedUSD;
  });
}
