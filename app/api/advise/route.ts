// POST /api/advise { facts, fines, planPeriod?, fuels?, affordable? } -> AdvicePlan
// Code computes the candidate fixes; Claude only ranks + explains.

import { computeCandidateFixes } from '@/lib/advise/roi';
import { generateAdvice } from '@/lib/ai/advise';
import { MEASURES } from '@/data/catalogs/measures';
import { REBATES } from '@/data/catalogs/rebates';
import { deriveContext } from '@/lib/buildingInput';
import type { BuildingFacts } from '@/lib/data/types';
import type { FineResult, Period } from '@/lib/ll97/engine';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: {
    facts: BuildingFacts;
    fines: FineResult[] | null;
    planPeriod?: Period;
    fuels?: string[];
    affordable?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { facts, fines } = body;
  if (!facts || !fines) {
    return Response.json({ error: 'facts and fines required (no fine data for this building)' }, { status: 400 });
  }

  const planPeriod: Period = body.planPeriod ?? '2030-2034';
  const ctx = deriveContext(facts, { fuels: body.fuels, affordable: body.affordable });
  const candidates = computeCandidateFixes(fines, MEASURES, REBATES, planPeriod, ctx);
  const plan = await generateAdvice(facts, fines, candidates, planPeriod);
  return Response.json(plan);
}
