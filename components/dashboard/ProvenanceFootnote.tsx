import type { BuildingFacts } from "@/lib/data/types";
import type { FineResult } from "@/lib/ll97/engine";

// The literal fine print: every provenance note and every engine caveat,
// verbatim, behind a single quiet disclosure. Never summarized, never cut.
export function ProvenanceFootnote({
  facts,
  fines,
}: {
  facts: BuildingFacts;
  fines: FineResult[];
}) {
  const notes = Array.from(new Set(fines.flatMap((f) => f.notes)));
  const items = [
    ...facts.provenance.map(
      (p) => `${p.field}: ${p.source}${p.detail ? `; ${p.detail}` : ""}`,
    ),
    ...notes,
    "Estimate only. The official LL97 compliance figure requires a registered design professional.",
  ];
  return (
    <details className="group border-t border-ink pt-3">
      <summary className="legal-label cursor-pointer list-none">
        The fine print · how we know this
        <span className="ml-2 inline-block transition-transform group-open:rotate-90">
          →
        </span>
      </summary>
      <ol className="mt-3 max-w-3xl space-y-2 text-[0.68rem] leading-relaxed text-ink-60">
        {items.map((text, i) => (
          <li key={i}>
            <span className="tabular-nums text-ink-40">{i + 1}. </span>
            {text}
          </li>
        ))}
      </ol>
    </details>
  );
}
