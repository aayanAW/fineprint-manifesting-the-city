// Broadsheet masthead, pared back: one rule, one name, two labels.
export function Masthead() {
  return (
    <header className="rise">
      <div className="flex items-baseline justify-between pb-2">
        <p className="legal-label">The Local Law 97 Ledger</p>
        <p className="legal-label">New York City</p>
      </div>
      <div className="rule-double rule-animate" />
      <h1 className="pt-4 font-display text-5xl font-light tracking-tight sm:text-6xl">
        FinePrint
      </h1>
    </header>
  );
}
