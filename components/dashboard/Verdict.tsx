import { usd, tons } from "@/lib/utils";
import type { FineResult } from "@/lib/ll97/engine";
import type { BuildingFacts } from "@/lib/data/types";

// The headline verdict, set like a court judgment. One headline, one line of
// context, a quiet stats rail. Everything else lives in the fine print.
export function Verdict({
  facts,
  fines,
}: {
  facts: BuildingFacts;
  fines: FineResult[];
}) {
  const cliff = fines.find((f) => f.period === "2030-2034");
  const today = fines.find((f) => f.period === "2024-2029");
  const isArticle321 = fines[0]?.pathway === "article321";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(15rem,0.4fr)]">
      <div>
        <p className="legal-label">
          In the matter of <span className="text-ink">{facts.address}</span>
        </p>

        {fines.length === 0 ? (
          <>
            <p className="mt-4 font-display text-5xl font-light leading-[1.05] sm:text-6xl">
              Not enough public data<span className="italic"> yet</span>.
            </p>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-60">
              No usable LL84 filing was found for this lot, so no fine can be
              computed honestly.
            </p>
          </>
        ) : isArticle321 ? (
          <>
            <p className="mt-4 font-display text-5xl font-light leading-[1.05] sm:text-6xl">
              No dollar penalty. <span className="italic">Article 321.</span>
            </p>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-60">
              Affordable-housing pathway: comply via prescribed measures or by
              meeting the 2030 target of{" "}
              {cliff ? tons(cliff.emissionsLimitTco2e) : "n/a"} early.
            </p>
          </>
        ) : cliff && !cliff.compliant ? (
          <>
            <p className="mt-4 font-display font-light leading-none tracking-tight text-[clamp(3.5rem,9vw,7rem)]">
              {usd(cliff.annualFineUsd)}
              <span className="text-[0.35em] text-ink-60"> / yr</span>
            </p>
            <p className="mt-3 max-w-xl font-display text-xl italic leading-snug">
              {today?.compliant
                ? "owed each year from 2030. Legal today; that is the cliff."
                : `owed each year from 2030, on top of ${usd(today?.annualFineUsd ?? 0)}/yr already accruing today.`}
            </p>
          </>
        ) : (
          <p className="mt-4 font-display text-5xl font-light leading-[1.05] sm:text-6xl">
            Compliant through 2034.
          </p>
        )}
      </div>

      <dl className="flex flex-col gap-4 border-l border-hairline pl-6 text-xs">
        <div>
          <dt className="legal-label">Floor area</dt>
          <dd className="mt-1 font-display text-2xl font-light">
            {facts.grossFloorAreaSqft != null
              ? `${facts.grossFloorAreaSqft.toLocaleString("en-US")} sf`
              : "unknown"}
          </dd>
        </div>
        <div>
          <dt className="legal-label">Annual emissions</dt>
          <dd className="mt-1 font-display text-2xl font-light">
            {facts.annualEmissionsTco2e != null
              ? tons(facts.annualEmissionsTco2e)
              : "unknown"}
          </dd>
        </div>
        <div>
          <dt className="legal-label">LL97 covered</dt>
          <dd className="mt-1 font-display text-2xl font-light">
            {facts.isLl97Covered == null
              ? "unknown"
              : facts.isLl97Covered
                ? "Yes"
                : "No"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
