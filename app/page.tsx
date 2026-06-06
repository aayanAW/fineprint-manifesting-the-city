import { computeAllPeriods } from '@/lib/ll97/engine';

// Placeholder home — proves the remade engine renders end-to-end. Replaced by
// the real search → result-card UI in the P0 data + UI tasks.
export default function Home() {
  const demo = computeAllPeriods({
    grossFloorAreaSqft: 44_800,
    occupancyGroups: [{ group: 'Multifamily Housing', sqft: 44_800 }],
    annualEmissionsTco2e: 287.0,
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">FinePrint</h1>
      <p className="mt-2 text-sm opacity-70">
        NYC Local Law 97 compliance copilot. Code computes every number; AI only explains.
      </p>

      <section className="mt-10 rounded-xl border border-black/10 p-5">
        <h2 className="text-sm font-medium opacity-60">
          Demo — 44,800&nbsp;sf Multifamily (engine self-check)
        </h2>
        <table className="mt-4 w-full text-sm tabular-nums">
          <thead className="text-left opacity-50">
            <tr>
              <th className="py-1">Period</th>
              <th>Limit (tCO₂e)</th>
              <th>Emissions</th>
              <th>Annual fine</th>
            </tr>
          </thead>
          <tbody>
            {demo.map(r => (
              <tr key={r.period} className="border-t border-black/5">
                <td className="py-1">{r.period}</td>
                <td>{r.emissionsLimitTco2e.toLocaleString()}</td>
                <td>{r.actualEmissionsTco2e.toLocaleString()}</td>
                <td style={{ color: r.compliant ? 'var(--color-under)' : 'var(--color-over)' }}>
                  {r.annualFineUsd > 0 ? `$${r.annualFineUsd.toLocaleString()}` : '$0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs opacity-50">
          The 2030 cliff: compliant today, fined from 2030. Real search lands in the next P0 task.
        </p>
      </section>
    </main>
  );
}
