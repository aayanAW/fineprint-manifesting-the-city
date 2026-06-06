import { usd, compact } from "@/lib/utils";
import { MOCK_CITY } from "@/lib/mock";

// Citywide exposure, set like a front-page statistics box. The Leaflet
// heatmap lands in P2; this board is the typographic aggregate.
export function CityBoard() {
  const c = MOCK_CITY;
  return (
    <div className="space-y-12">
      <div className="grid gap-y-8 sm:grid-cols-3">
        <div className="sm:border-r sm:border-hairline sm:pr-8">
          <p className="legal-label">Covered buildings</p>
          <p className="mt-2 font-display text-5xl font-light tabular-nums">
            {c.coveredBuildings.toLocaleString("en-US")}
          </p>
          <p className="mt-2 text-[0.7rem] text-ink-60">
            on DOB's Covered Buildings List
          </p>
        </div>
        <div className="sm:border-r sm:border-hairline sm:px-8">
          <p className="legal-label">Over the 2030 limit</p>
          <p className="mt-2 font-display text-5xl font-light tabular-nums">
            {c.overLimit2030.toLocaleString("en-US")}
          </p>
          <p className="mt-2 text-[0.7rem] text-ink-60">
            {(c.shareOver2030 * 100).toFixed(0)}% of the stock, at today's
            emissions
          </p>
        </div>
        <div className="sm:pl-8">
          <p className="legal-label">2030 exposure</p>
          <p className="mt-2 font-display text-5xl font-light tabular-nums">
            ${compact(c.totalExposureUsd2030)}
          </p>
          <p className="mt-2 text-[0.7rem] text-ink-60">
            per year · {compact(c.totalOverageTco2e2030)} tCO₂e over the caps
          </p>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <p className="legal-label">By borough</p>
          <table className="mt-3 w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left">
                <th
                  scope="col"
                  className="legal-label border-b border-ink py-2 font-normal"
                >
                  Borough
                </th>
                <th
                  scope="col"
                  className="legal-label border-b border-ink py-2 text-right font-normal"
                >
                  Covered
                </th>
                <th
                  scope="col"
                  className="legal-label border-b border-ink py-2 text-right font-normal"
                >
                  Over 2030
                </th>
                <th
                  scope="col"
                  className="legal-label border-b border-ink py-2 text-right font-normal"
                >
                  Exposure / yr
                </th>
              </tr>
            </thead>
            <tbody>
              {c.boroughs.map((b) => (
                <tr key={b.name} className="border-b border-hairline">
                  <td className="py-2.5">{b.name}</td>
                  <td className="py-2.5 text-right">
                    {b.covered.toLocaleString("en-US")}
                  </td>
                  <td className="py-2.5 text-right">
                    {b.over2030.toLocaleString("en-US")}
                  </td>
                  <td className="py-2.5 text-right">${compact(b.exposure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="legal-label">Largest projected 2030 fines</p>
          <ol className="mt-3">
            {c.worstOffenders.map((w) => (
              <li
                key={w.rank}
                className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 text-xs"
              >
                <span className="flex items-baseline gap-3">
                  <span className="tabular-nums text-ink-40">
                    {String(w.rank).padStart(2, "0")}
                  </span>
                  <span>
                    {w.address}
                    <span className="legal-label ml-2">
                      {w.borough} · {w.use}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {usd(w.fine2030)}/yr
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="border-t border-hairline pt-3 text-[0.65rem] leading-relaxed text-ink-40">
        {c.note}
      </p>
    </div>
  );
}
