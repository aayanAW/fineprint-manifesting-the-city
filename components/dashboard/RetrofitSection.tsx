"use client";

import { useEffect, useState } from "react";
import { usd, tons, compact } from "@/lib/utils";
import { fetchOptimize, fetchAdvise } from "@/lib/client/api";
import { MOCK_RETROFIT_PLAN, MOCK_ADVICE } from "@/lib/mock";
import { MaccChart } from "./MaccChart";
import { ScheduleTimeline } from "./ScheduleTimeline";
import type { RetrofitPlan } from "@/lib/optimize/types";
import type { AdvicePlan } from "@/lib/ai/types";
import type { BuildingFacts } from "@/lib/data/types";
import type { FineResult } from "@/lib/ll97/engine";

// Fetches the code-computed plan (/api/optimize) and the AI narration
// (/api/advise) for the current building; falls back to the typed demo plan
// when offline so the section never renders empty.
export function RetrofitSection({
  facts,
  fines,
}: {
  facts: BuildingFacts;
  fines: FineResult[];
}) {
  const [plan, setPlan] = useState<RetrofitPlan | null>(null);
  const [advice, setAdvice] = useState<AdvicePlan | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    setPlan(null);
    setAdvice(null);
    setOffline(false);
    if (fines.length === 0) return;
    Promise.all([fetchOptimize(facts, fines), fetchAdvise(facts, fines)])
      .then(([p, a]) => {
        if (!alive) return;
        setPlan(p);
        setAdvice(a);
      })
      .catch(() => {
        if (!alive) return;
        setPlan(MOCK_RETROFIT_PLAN);
        setAdvice(MOCK_ADVICE);
        setOffline(true);
      });
    return () => {
      alive = false;
    };
  }, [facts, fines]);

  if (fines.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-ink-60">
        No fine data for this building, so there is nothing to optimize yet.
      </p>
    );
  }

  if (!plan || !advice) {
    return (
      <p className="legal-label" aria-live="polite">
        Enumerating retrofit combinations…
      </p>
    );
  }

  // Public data carries no dwelling-unit count for many buildings, so the
  // optimizer can't price capital. Say "unpriced" rather than a false $0.
  const unpriced = plan.capexUSD === 0 && plan.chosenMeasureKeys.length > 0;
  const stats: Array<{ label: string; value: string; note?: string }> = [
    {
      label: "Capital, net of rebates",
      value: unpriced ? "unpriced" : usd(plan.capexUSD),
      note: unpriced
        ? "no unit count in public data; cost not estimable"
        : undefined,
    },
    { label: "Fines avoided to 2050", value: usd(plan.totalFinesAvoidedUSD) },
    {
      label: "Residual emissions · 2030 basis",
      value: tons(plan.residualEmissionsTco2e),
    },
    {
      label: "Total cost of ownership",
      value: unpriced ? "unpriced" : usd(plan.tcoUSD),
      note: unpriced
        ? undefined
        : `±$${compact(plan.range.tcoHighUSD - plan.range.tcoLowUSD)} uncertainty`,
    },
  ];

  return (
    <div className="space-y-20">
      <div>
        {offline && (
          <p className="legal-label mb-6" role="status">
            Offline · showing the demo plan
          </p>
        )}
        <p className="legal-label">The way out</p>
        <p className="mt-4 max-w-2xl font-display text-4xl font-light leading-snug">
          {plan.chosenMeasureKeys.length > 0 ? (
            <>
              {plan.chosenMeasureKeys.length} measures drive the projected fine
              toward <span className="italic">zero</span>.
            </>
          ) : (
            <>Already at the target; no retrofit required.</>
          )}
        </p>

        <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="border-t border-ink pt-3">
              <dt className="legal-label">{s.label}</dt>
              <dd className="mt-3 font-display text-3xl font-light tabular-nums">
                {s.value}
              </dd>
              {s.note && (
                <dd className="mt-2 text-[0.65rem] text-ink-40">{s.note}</dd>
              )}
            </div>
          ))}
        </dl>

        <p className="mt-12 max-w-[64ch] text-sm leading-relaxed text-ink-60">
          {advice.explainer}
        </p>
        <p className="legal-label mt-4">
          {advice.source === "ai"
            ? "narrated by Claude · numbers by engine"
            : "estimated · deterministic fallback"}
        </p>
      </div>

      <MaccChart plan={plan} />

      <ScheduleTimeline plan={plan} />

      {Object.keys(plan.matchedRebatesByMeasure).length > 0 && (
        <div>
          <p className="legal-label">Matched funding</p>
          <ul className="mt-5 grid gap-x-16 gap-y-4 text-xs md:grid-cols-2">
            {Object.entries(plan.matchedRebatesByMeasure).map(
              ([measureKey, rebates]) =>
                rebates.map((r) => (
                  <li
                    key={`${measureKey}-${r.name}`}
                    className="flex items-baseline justify-between gap-6 border-b border-hairline pb-3"
                  >
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-ink-20 underline-offset-4 hover:decoration-ink"
                    >
                      {r.name}
                    </a>
                    <span className="shrink-0 tabular-nums">
                      {r.amountShort}
                    </span>
                  </li>
                )),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
