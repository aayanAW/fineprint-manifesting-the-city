import { usd, tons } from "@/lib/utils";
import type { FineResult } from "@/lib/ll97/engine";
import type { BuildingFacts } from "@/lib/data/types";

// The headline verdict, set like a court judgment.
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
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(16rem,0.45fr)]">
      <div>
        <p className="legal-label">
          In the matter of <span className="text-ink">{facts.address}</span> ·
          BBL {facts.bbl}
        </p>

        {isArticle321 ? (
          <>
            <p className="mt-4 font-display text-5xl font-light leading-[1.05] sm:text-6xl">
              No dollar penalty.
              <br />
              <span className="italic">Article 321 pathway.</span>
            </p>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-60">
              This building complies through prescribed energy-conservation
              measures or by meeting its 2030 target of{" "}
              {cliff ? tons(cliff.emissionsLimitTco2e) : "n/a"} early. Current
              emissions:{" "}
              {facts.annualEmissionsTco2e != null
                ? tons(facts.annualEmissionsTco2e)
                : "unknown"}
              .
            </p>
          </>
        ) : cliff && !cliff.compliant ? (
          <>
            <p className="mt-4 font-display font-light leading-none tracking-tight text-[clamp(3.5rem,9vw,7rem)]">
              {usd(cliff.annualFineUsd)}
              <span className="text-[0.35em] text-ink-60"> / yr</span>
            </p>
            <p className="mt-3 font-display text-xl italic">
              owed each year from 2030, under Local Law 97 as written.
            </p>
            {today?.compliant && (
              <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-60">
                The same emissions are fully legal today. The cap drops from{" "}
                {tons(today.emissionsLimitTco2e)} to{" "}
                {tons(cliff.emissionsLimitTco2e)} in 2030: that is the cliff.
              </p>
            )}
            {!today?.compliant && today && (
              <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-60">
                Already over the cap today: {usd(today.annualFineUsd)}/yr in the
                current period, rising at the 2030 reset.
              </p>
            )}
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
            <span className="fn">1</span>
          </dd>
        </div>
        <div>
          <dt className="legal-label">Primary use</dt>
          <dd className="mt-1 font-display text-2xl font-light">
            {facts.occupancyGroups[0]?.group ?? "unknown"}
            {facts.occupancyGroups.length > 1 && (
              <span className="text-sm text-ink-40">
                {" "}
                +{facts.occupancyGroups.length - 1}
              </span>
            )}
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
            <span className="fn">2</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
