// POST /api/optimize { facts, fines, targetPeriod?, fuels?, affordable? } -> RetrofitPlan
// Exact-enumeration optimizer; the LLM is not involved — every number is code-computed.

import { optimizeRetrofit } from '@/lib/optimize/retrofit';
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
    targetPeriod?: Period;
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

  const ctx = deriveContext(facts, { fuels: body.fuels, affordable: body.affordable });
  const plan = optimizeRetrofit(
    {
      fines,
      fuels: ctx.fuels,
      units: ctx.units,
      isMultifamily: ctx.isMultifamily,
      affordable: ctx.affordable,
      targetPeriod: body.targetPeriod,
    },
    MEASURES,
    REBATES,
  );
  return Response.json(plan);
}
