// Thin client for the FinePrint API routes. Components call these and fall
// back to the typed mock layer when the network or backend is unavailable,
// so the demo never dies on venue wifi.

import type { BuildingFacts } from "@/lib/data/types";
import type { FineResult } from "@/lib/ll97/engine";
import type { RetrofitPlan } from "@/lib/optimize/types";
import type { AdvicePlan, RagAnswer } from "@/lib/ai/types";

export interface BuildingResult {
  facts: BuildingFacts;
  fines: FineResult[];
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `${url} responded ${res.status}`,
    );
  }
  return data as T;
}

export const fetchBuilding = (address: string) =>
  post<BuildingResult>("/api/building", { address });

export const fetchOptimize = (facts: BuildingFacts, fines: FineResult[]) =>
  post<RetrofitPlan>("/api/optimize", { facts, fines });

export const fetchAdvise = (facts: BuildingFacts, fines: FineResult[]) =>
  post<AdvicePlan>("/api/advise", { facts, fines });

export const fetchAsk = (question: string) =>
  post<RagAnswer>("/api/ask", { question });
