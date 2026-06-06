import { cn, usd, tons } from "@/lib/utils";
import type { RetrofitPlan } from "@/lib/optimize/types";

// Marginal abatement cost curve, set typographically: one ruled row per
// measure, a zero axis down the middle. Bars left of zero SAVE money (solid
// ink); bars right of zero COST money (hatched). No chart library needed.
export function MaccChart({ plan }: { plan: RetrofitPlan }) {
  const max = Math.max(...plan.macc.map((m) => Math.abs(m.costPerTonUSD ?? 0)));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="legal-label">Marginal abatement cost · $/tCO₂e</p>
        <p className="legal-label">← saves money · costs money →</p>
      </div>
      <ul className="mt-3">
        {plan.macc.map((m) => {
          const v = m.costPerTonUSD ?? 0;
          const widthPct = max === 0 ? 0 : (Math.abs(v) / max) * 50;
          const chosen = plan.chosenMeasureKeys.includes(m.measureKey);
          return (
            <li key={m.measureKey} className="border-b border-hairline py-5">
              <div className="flex items-baseline justify-between gap-4">
                <p
                  className={cn(
                    "text-xs",
                    chosen ? "font-medium" : "text-ink-60",
                  )}
                >
                  {m.name}
                  {chosen && (
                    <span className="legal-label ml-2 text-ink">· in plan</span>
                  )}
                </p>
                <p className="shrink-0 text-xs tabular-nums">
                  {v < 0 ? `−${usd(Math.abs(v))}` : usd(v)}/t ·{" "}
                  {tons(m.tCO2eReduced)}
                </p>
              </div>
              <div className="relative mt-3 h-3" aria-hidden>
                <span className="absolute left-1/2 top-[-4px] h-[calc(100%+8px)] w-px bg-ink" />
                <span
                  className={cn(
                    "absolute top-0 h-full border border-ink",
                    v < 0 ? "bg-ink" : "hatch bg-wash",
                  )}
                  style={
                    v < 0
                      ? { right: "50%", width: `${widthPct}%` }
                      : { left: "50%", width: `${widthPct}%` }
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
