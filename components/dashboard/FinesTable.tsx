import { cn, usd } from "@/lib/utils";
import type { FineResult } from "@/lib/ll97/engine";

// The ledger proper: one ruled row per compliance period.
export function FinesTable({ fines }: { fines: FineResult[] }) {
  if (fines.length === 0) return null;
  return (
    <table className="w-full max-w-2xl text-sm tabular-nums">
      <caption className="sr-only">
        Computed Local Law 97 penalty by compliance period
      </caption>
      <thead>
        <tr className="text-left">
          <th
            scope="col"
            className="legal-label border-b border-ink py-2 font-normal"
          >
            Period
          </th>
          <th
            scope="col"
            className="legal-label border-b border-ink py-2 pl-4 text-right font-normal"
          >
            Emissions tCO₂e
          </th>
          <th
            scope="col"
            className="legal-label border-b border-ink py-2 pl-4 text-right font-normal"
          >
            Limit tCO₂e
          </th>
          <th
            scope="col"
            className="legal-label border-b border-ink py-2 pl-4 text-right font-normal"
          >
            Annual fine
          </th>
        </tr>
      </thead>
      <tbody>
        {fines.map((f) => (
          <tr key={f.period} className="border-b border-hairline">
            <td className="py-3 pr-4">{f.period}</td>
            <td className="py-3 pl-4 text-right">
              {f.actualEmissionsTco2e.toLocaleString("en-US")}
            </td>
            <td className="py-3 pl-4 text-right">
              {f.emissionsLimitTco2e.toLocaleString("en-US")}
            </td>
            <td
              className={cn(
                "py-3 pl-4 text-right",
                !f.compliant &&
                  "font-medium underline decoration-2 underline-offset-4",
              )}
            >
              {f.compliant ? "$0" : usd(f.annualFineUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
