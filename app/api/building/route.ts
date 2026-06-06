// POST /api/building { address?, bbl? } -> { facts, fines }
// Read-through SQLite cache → live lookup; engine computes the fines.

import { getBuildingFacts } from '@/lib/data/cache';
import { computeFines } from '@/lib/buildingInput';

export const runtime = 'nodejs'; // better-sqlite3 is a native module

export async function POST(req: Request) {
  let body: { address?: string; bbl?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { address, bbl } = body;
  if (!address && !bbl) {
    return Response.json({ error: 'address or bbl required' }, { status: 400 });
  }

  try {
    const facts = await getBuildingFacts(address ?? bbl!, { bbl });
    const fines = computeFines(facts);
    return Response.json({ facts, fines });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
