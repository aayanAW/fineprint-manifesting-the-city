import Anthropic from '@anthropic-ai/sdk';
import type { BuildingAssessment } from '@/types/assessment';
import type { FixCandidate, AdvicePlan } from '@/types/advise';
import type { Period } from '@/lib/ll97/coefficients';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    explainer: { type: 'string', description: "plain-English explanation of the building's LL97 situation for a non-expert board member" },
    boardSummary: { type: 'string', description: 'one-paragraph summary a co-op/condo board can act on' },
    order: { type: 'array', items: { type: 'string' }, description: 'measureKeys in recommended priority order' },
    rationales: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { measureKey: { type: 'string' }, rationale: { type: 'string' } }, required: ['measureKey', 'rationale'] } },
  },
  required: ['explainer', 'boardSummary', 'order', 'rationales'],
};

const SYSTEM = `You are an LL97 retrofit advisor for non-expert NYC building boards and small landlords.
The emissions, fines, costs, rebates, and payback you are given are AUTHORITATIVE and computed externally — NEVER recompute, restate differently, or alter any number; only reference them.
Rank the provided fixes for THIS building, weighting electrification (heat pumps) because LL97's grid-electricity emissions coefficient drops toward zero by 2040 while gas and oil stay flat forever.
Write in plain language a resident board member understands. Be honest that figures are estimates.`;

function fallbackPlan(a: BuildingAssessment, candidates: FixCandidate[], planPeriod: Period): AdvicePlan {
  const currentFine = Math.round(a.fines['2024-2029']?.annual_usd ?? 0);
  const planFine = Math.round(a.fines[planPeriod]?.annual_usd ?? 0);
  const explainer = planFine > 0
    ? `${currentFine > 0
        ? `Your building is over its Local Law 97 carbon cap and faces an estimated $${currentFine.toLocaleString()}/year penalty today`
        : `Your building meets its Local Law 97 cap today`}. The cap tightens sharply in 2030 — the penalty rises to about $${planFine.toLocaleString()}/year. The fixes below are ranked by payback against that ${planPeriod} cap, which is where retrofits start paying for themselves.`
    : `Your building meets its Local Law 97 cap through ${planPeriod}. The measures below help keep it compliant as limits tighten and cut energy costs.`;
  return { explainer, boardSummary: explainer, rankedFixes: candidates, source: 'fallback' };
}

/**
 * Apply Claude's recommended order to the candidates, attaching rationales — every candidate appears
 * EXACTLY ONCE. Dedupe is by measureKey, not object identity: we push spread copies, so an identity
 * check (`ranked.includes(c)`) never matches the original `c` and would duplicate every fix.
 */
export function mergeRanking(candidates: FixCandidate[], order: string[], rationales: Map<string, string>): FixCandidate[] {
  const byKey = new Map(candidates.map(c => [c.measureKey, c]));
  const ranked: FixCandidate[] = [];
  const used = new Set<string>();
  for (const k of order) {
    const c = byKey.get(k);
    if (c && !used.has(c.measureKey)) { ranked.push({ ...c, rationale: rationales.get(k) }); used.add(c.measureKey); }
  }
  for (const c of candidates) {
    if (!used.has(c.measureKey)) { ranked.push({ ...c, rationale: rationales.get(c.measureKey) }); used.add(c.measureKey); }
  }
  return ranked;
}

/** Rank + explain via Claude; numbers come from `candidates` unchanged. Falls back with no API key or on error. */
export async function generateAdvice(a: BuildingAssessment, candidates: FixCandidate[], planPeriod: Period = '2030-2034'): Promise<AdvicePlan> {
  if (!process.env.ANTHROPIC_API_KEY || candidates.length === 0) return fallbackPlan(a, candidates, planPeriod);
  try {
    const client = new Anthropic();
    const currentFine = Math.round(a.fines['2024-2029']?.annual_usd ?? 0);
    const planFine = Math.round(a.fines[planPeriod]?.annual_usd ?? 0);
    const user = `Building: ${a.building.address}, ${a.building.gfa.toLocaleString()} sq ft, ${a.building.primaryType}.
Current 2024-2029 fine: $${currentFine.toLocaleString()}/yr. The LL97 cap tightens in 2030: the ${planPeriod} fine is $${planFine.toLocaleString()}/yr.
The fix-it plan economics below (tCO2eReduced, fineAvoidedUSD, paybackYears) are computed against the ${planPeriod} cap — make clear the payoff is driven by the 2030 cliff, not the small current fine. Each fix's avoided fine is standalone (they do not add up).
Fuel emissions method: ${a.emissions.method}. Flags: ${a.flags.join(', ') || 'none'}.
Candidate fixes (numbers are final — do not change them):
${JSON.stringify(candidates.map(c => ({ measureKey: c.measureKey, measure: c.measure, tCO2eReduced: Math.round(c.tCO2eReduced), netCostUSD: c.netCostUSD, paybackYears: c.paybackYears, fineAvoidedUSD: Math.round(c.fineAvoidedUSD), rebates: c.matchedRebates.map(r => r.name) })), null, 2)}
Return: explainer, boardSummary, the recommended order (measureKeys), and a one-sentence rationale per measureKey.`;
    const res = await client.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: user }],
    });
    const textBlock = res.content.find((b: Anthropic.ContentBlock) => b.type === 'text') as Anthropic.TextBlock | undefined;
    const parsed = JSON.parse(textBlock?.text ?? '{}');
    const order: string[] = Array.isArray(parsed.order) ? parsed.order : [];
    const rats = new Map<string, string>((parsed.rationales ?? []).map((r: { measureKey: string; rationale: string }) => [r.measureKey, r.rationale]));
    const ranked = mergeRanking(candidates, order, rats);
    return { explainer: String(parsed.explainer ?? ''), boardSummary: String(parsed.boardSummary ?? ''), rankedFixes: ranked, source: 'ai' };
  } catch {
    return fallbackPlan(a, candidates, planPeriod);
  }
}
