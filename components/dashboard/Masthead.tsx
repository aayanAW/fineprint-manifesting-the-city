// Broadsheet masthead. The product IS fine print; the page reads like a ledger.
export function Masthead() {
  return (
    <header className="rise">
      <div className="flex items-baseline justify-between pb-2">
        <p className="legal-label">The Local Law 97 Ledger</p>
        <p className="legal-label">New York City · Est. 2024</p>
      </div>
      <div className="rule-double rule-animate" />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4">
        <h1 className="font-display text-6xl font-light tracking-tight sm:text-7xl">
          FinePrint<span className="align-top text-2xl">*</span>
        </h1>
        <p className="max-w-xs pb-2 text-[0.7rem] leading-relaxed text-ink-60">
          *Every number on this page is computed by a deterministic engine from
          public city data. The AI explains; it never does arithmetic.
        </p>
      </div>
    </header>
  );
}
