import type { RetrofitPlan } from "@/lib/optimize/types";

// Work-back schedule: measures placed on a ruled year line that terminates at
// the 2030 cliff (a heavy double rule).
export function ScheduleTimeline({ plan }: { plan: RetrofitPlan }) {
  const years = [2026, 2027, 2028, 2029, 2030];
  const byYear = new Map<number, string[]>();
  for (const s of plan.schedule) {
    byYear.set(s.doByYear, [...(byYear.get(s.doByYear) ?? []), s.name]);
  }

  return (
    <div>
      <p className="legal-label">
        Work-back schedule · everything lands before the cliff
      </p>
      <ol className="mt-4 grid grid-cols-5">
        {years.map((year) => {
          const items = byYear.get(year) ?? [];
          const isCliff = year === 2030;
          return (
            <li
              key={year}
              className={
                isCliff ? "rule-double pt-3" : "border-t border-ink pt-3"
              }
            >
              <p
                className={`px-1 text-xs tabular-nums ${isCliff ? "font-medium" : ""}`}
              >
                {year}
                {isCliff && (
                  <span className="legal-label ml-1 text-ink">· the cliff</span>
                )}
              </p>
              <ul className="mt-2 space-y-2 px-1 pb-2">
                {items.map((name) => (
                  <li
                    key={name}
                    className="text-[0.68rem] leading-snug text-ink-60"
                  >
                    {name}
                  </li>
                ))}
                {isCliff && (
                  <li className="text-[0.68rem] font-medium leading-snug">
                    New limits take effect. Plan target: $0 penalty.
                  </li>
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
