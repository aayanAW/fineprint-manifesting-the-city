import type { BuildingFacts } from "@/lib/data/types";
import type { FineResult } from "@/lib/ll97/engine";

// The literal fine print: every provenance note and every engine caveat,
// rendered verbatim. This is the trust layer; never summarize it.
export function ProvenanceFootnote({
  facts,
  fines,
}: {
  facts: BuildingFacts;
  fines: FineResult[];
}) {
  const notes = Array.from(new Set(fines.flatMap((f) => f.notes)));
  return (
    <footer className="border-t border-ink pt-3">
      <p className="legal-label">The fine print · how we know this</p>
      <ol className="mt-3 columns-1 gap-10 text-[0.68rem] leading-relaxed text-ink-60 md:columns-2">
        {facts.provenance.map((p, i) => (
          <li key={`prov-${i}`} className="mb-2 break-inside-avoid">
            <span className="tabular-nums text-ink-40">{i + 1}. </span>
            <span className="text-ink">{p.field}</span>: {p.source}
            {p.detail ? `; ${p.detail}` : ""}
          </li>
        ))}
        {notes.map((n, i) => (
          <li key={`note-${i}`} className="mb-2 break-inside-avoid">
            <span className="tabular-nums text-ink-40">
              {facts.provenance.length + i + 1}.{" "}
            </span>
            {n}
          </li>
        ))}
        <li className="mb-2 break-inside-avoid">
          <span className="tabular-nums text-ink-40">
            {facts.provenance.length + notes.length + 1}.{" "}
          </span>
          Estimate only. The official LL97 compliance figure requires a
          registered design professional.
        </li>
      </ol>
    </footer>
  );
}
