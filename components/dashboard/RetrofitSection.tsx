import { usd, tons, compact } from "@/lib/utils";
import { MaccChart } from "./MaccChart";
import { ScheduleTimeline } from "./ScheduleTimeline";
import type { RetrofitPlan } from "@/lib/optimize/types";
import type { AdvicePlan } from "@/lib/ai/types";

export function RetrofitSection({
  plan,
  advice,
}: {
  plan: RetrofitPlan;
  advice: AdvicePlan;
}) {
  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[0.45fr_1fr]">
        <div>
          <p className="legal-label">The way out</p>
          <p className="mt-3 font-display text-3xl font-light leading-snug">
            {plan.chosenMeasureKeys.length} measures drive the projected fine to{" "}
            <span className="italic">zero</span>.
          </p>
          <dl className="mt-6 space-y-4 text-xs">
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="legal-label">Gross capital</dt>
              <dd className="font-display text-xl font-light tabular-nums">
                {usd(plan.capexUSD)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="legal-label">Fines avoided to 2050</dt>
              <dd className="font-display text-xl font-light tabular-nums">
                {usd(plan.totalFinesAvoidedUSD)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="legal-label">Residual emissions, 2030 basis</dt>
              <dd className="font-display text-xl font-light tabular-nums">
                {tons(plan.residualEmissionsTco2e)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="legal-label">Total cost of ownership</dt>
              <dd className="font-display text-xl font-light tabular-nums">
                {usd(plan.tcoUSD)}
                <span className="ml-2 text-[0.6rem] text-ink-40">
                  range ${compact(plan.range.tcoLowUSD)}–$
                  {compact(plan.range.tcoHighUSD)}
                </span>
              </dd>
            </div>
          </dl>
          <p className="mt-6 text-[0.7rem] leading-relaxed text-ink-60">
            {advice.explainer}
          </p>
          <p className="legal-label mt-4">
            {advice.source === "ai"
              ? "narrated by Claude · numbers by engine"
              : "estimated · deterministic fallback"}
          </p>
        </div>
        <MaccChart plan={plan} />
      </div>

      <ScheduleTimeline plan={plan} />

      <div>
        <p className="legal-label">Matched funding</p>
        <ul className="mt-3 grid gap-x-10 gap-y-3 text-xs md:grid-cols-2">
          {Object.entries(plan.matchedRebatesByMeasure).map(
            ([measureKey, rebates]) =>
              rebates.map((r) => (
                <li
                  key={`${measureKey}-${r.name}`}
                  className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2"
                >
                  <span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-ink-20 underline-offset-4 hover:decoration-ink"
                    >
                      {r.name}
                    </a>
                    <span className="legal-label ml-2">{measureKey}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{r.amountShort}</span>
                </li>
              )),
          )}
        </ul>
      </div>
    </div>
  );
}
