// FinePrint v2 — AI advice layer.
//
// THE ONE RULE: code computes every number; Claude only ranks and explains.
// `lib/advise/roi.ts` (computeCandidateFixes) emits a FixCandidate[] in which every
// dollar, ton, and year is deterministic. This module asks Claude to (a) reorder those
// candidates by their measureKey and (b) write the explainer / boardSummary / per-fix
// rationale prose — it NEVER recomputes or alters a number. The merge keeps each
// candidate's numbers verbatim and only attaches Claude's ordering + rationale.
//
// AI key is OPTIONAL. With no ANTHROPIC_API_KEY (or on any API error / empty
// candidates), generateAdvice runs a deterministic fallback: payback-rank (already the
// order roi.ts produced) + a templated explainer, with source:'fallback'.

import type { BuildingFacts } from '@/lib/data/types';
import type { FineResult, Period } from '@/lib/ll97/engine';
import type { FixCandidate } from '@/lib/advise/roi';

// Re-export the contract type so downstream (API route, UI) can import it from the AI layer.
export type { FixCandidate } from '@/lib/advise/roi';

export interface AdvicePlan {
  explainer: string;
  boardSummary: string;
  rankedFixes: FixCandidate[];
  source: 'ai' | 'fallback';
  planPeriod?: string;
  planPeriodFineUSD?: number;
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const DEFAULT_PERIOD: Period = '2030-2034';

// Structured-output schema: Claude returns prose + an ordering of measureKeys +
// one rationale per measureKey. It is given NO numeric fields to fill — numbers
// never round-trip through the model.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    explainer: {
      type: 'string',
      description: "Plain-English explanation of the building's LL97 situation for a non-expert board member.",
    },
    boardSummary: {
      type: 'string',
      description: 'One-paragraph summary a co-op/condo board can act on.',
    },
    order: {
      type: 'array',
      items: { type: 'string' },
      description: 'measureKeys in recommended priority order.',
    },
    rationales: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          measureKey: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['measureKey', 'rationale'],
      },
    },
  },
  required: ['explainer', 'boardSummary', 'order', 'rationales'],
};

const SYSTEM = `You are an LL97 retrofit advisor for non-expert NYC building boards and small landlords.
The emissions, fines, costs, rebates, and payback you are given are AUTHORITATIVE and computed externally — NEVER recompute, restate differently, or alter any number; only reference the figures provided.
Rank the provided fixes for THIS building, weighting electrification (heat pumps) because LL97's grid-electricity emissions coefficient drops toward zero by 2040 while gas and oil stay flat forever.
Write in plain language a resident board member understands. Be honest that the figures are estimates.`;

function fineForPeriod(fines: FineResult[], period: Period): number {
  return Math.round(fines.find(f => f.period === period)?.annualFineUsd ?? 0);
}

/** Deterministic, no-API explainer + payback-ranked plan (candidates already arrive payback-sorted). */
function fallbackPlan(
  facts: BuildingFacts,
  fines: FineResult[],
  candidates: FixCandidate[],
  planPeriod: Period,
): AdvicePlan {
  const currentFine = fineForPeriod(fines, '2024-2029');
  const planFine = fineForPeriod(fines, planPeriod);

  const explainer = planFine > 0
    ? `${currentFine > 0
        ? `Your building is over its Local Law 97 carbon cap and faces an estimated $${currentFine.toLocaleString()}/year penalty today`
        : `Your building meets its Local Law 97 cap today`}. The cap tightens sharply in 2030 — the penalty rises to about $${planFine.toLocaleString()}/year. The fixes below are ranked by payback against that ${planPeriod} cap, which is where retrofits start paying for themselves. These figures are estimates; a registered design professional confirms the official compliance number.`
    : `Your building meets its Local Law 97 cap through ${planPeriod}. The measures below help keep it compliant as limits tighten and cut energy costs. These figures are estimates.`;

  return {
    explainer,
    boardSummary: explainer,
    rankedFixes: candidates,
    source: 'fallback',
    planPeriod,
    planPeriodFineUSD: planFine,
  };
}

/**
 * Apply Claude's recommended order to the candidates, attaching rationales — every candidate
 * appears EXACTLY ONCE. Dedupe is by measureKey, NOT object identity: we push spread copies,
 * so an identity check (`ranked.includes(c)`) never matches the original `c` and would duplicate
 * every fix (the 14-cards-for-7-measures bug). Candidates the order omits are appended in their
 * original (payback) order so nothing is dropped. Numbers are copied verbatim via spread.
 */
export function mergeRanking(
  candidates: FixCandidate[],
  order: string[],
  rationales: Map<string, string>,
): FixCandidate[] {
  const byKey = new Map(candidates.map(c => [c.measureKey, c]));
  const ranked: FixCandidate[] = [];
  const used = new Set<string>();
  for (const k of order) {
    const c = byKey.get(k);
    if (c && !used.has(c.measureKey)) {
      ranked.push({ ...c, rationale: rationales.get(k) });
      used.add(c.measureKey);
    }
  }
  for (const c of candidates) {
    if (!used.has(c.measureKey)) {
      ranked.push({ ...c, rationale: rationales.get(c.measureKey) });
      used.add(c.measureKey);
    }
  }
  return ranked;
}

/**
 * Rank + explain via Claude; numbers come from `candidates` unchanged. Falls back
 * deterministically with no API key, no candidates, or on any error.
 */
export async function generateAdvice(
  facts: BuildingFacts,
  fines: FineResult[],
  candidates: FixCandidate[],
  planPeriod: Period = DEFAULT_PERIOD,
): Promise<AdvicePlan> {
  const planFine = fineForPeriod(fines, planPeriod);

  if (!process.env.ANTHROPIC_API_KEY || candidates.length === 0) {
    return fallbackPlan(facts, fines, candidates, planPeriod);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();

    const currentFine = fineForPeriod(fines, '2024-2029');
    const primaryUse =
      facts.occupancyGroups.slice().sort((a, b) => b.sqft - a.sqft)[0]?.group ?? 'mixed use';
    const gfa = facts.grossFloorAreaSqft;

    const user = `Building: ${facts.address}${gfa != null ? `, ${gfa.toLocaleString()} sq ft` : ''}, ${primaryUse}.
Current 2024-2029 fine: $${currentFine.toLocaleString()}/yr. The LL97 cap tightens in 2030: the ${planPeriod} fine is $${planFine.toLocaleString()}/yr.
The fix-it plan economics below (tCO2eReduced, fineAvoidedUSD, paybackYears) are computed against the ${planPeriod} cap — make clear the payoff is driven by the 2030 cliff, not the small current fine. Each fix's avoided fine is standalone (they do not add up).
Candidate fixes (numbers are FINAL — reference them, never change them):
${JSON.stringify(
  candidates.map(c => ({
    measureKey: c.measureKey,
    measure: c.measure,
    tCO2eReduced: Math.round(c.tCO2eReduced),
    netCostUSD: c.netCostUSD,
    paybackYears: c.paybackYears,
    fineAvoidedUSD: Math.round(c.fineAvoidedUSD),
    rebates: c.matchedRebates.map(r => r.name),
  })),
  null,
  2,
)}
Return: explainer, boardSummary, the recommended order (measureKeys), and a one-sentence rationale per measureKey.`;

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = res.content.find(b => b.type === 'text');
    const parsed = JSON.parse((textBlock as { text?: string } | undefined)?.text ?? '{}');

    const order: string[] = Array.isArray(parsed.order) ? parsed.order : [];
    const rationales = new Map<string, string>(
      (Array.isArray(parsed.rationales) ? parsed.rationales : [])
        .filter((r: unknown): r is { measureKey: string; rationale: string } =>
          !!r && typeof (r as { measureKey?: unknown }).measureKey === 'string')
        .map((r: { measureKey: string; rationale: string }) => [r.measureKey, r.rationale]),
    );
    const ranked = mergeRanking(candidates, order, rationales);

    return {
      explainer: String(parsed.explainer ?? ''),
      boardSummary: String(parsed.boardSummary ?? ''),
      rankedFixes: ranked,
      source: 'ai',
      planPeriod,
      planPeriodFineUSD: planFine,
    };
  } catch {
    return fallbackPlan(facts, fines, candidates, planPeriod);
  }
}
