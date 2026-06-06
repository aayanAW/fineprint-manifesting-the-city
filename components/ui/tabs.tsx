"use client";

import { cn } from "@/lib/utils";

export interface TabDef {
  id: string;
  label: string;
  index: string; // ledger-style section numeral, e.g. "01"
}

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Sections"
      className="flex w-full border-y border-ink"
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "group flex min-h-11 flex-1 items-baseline gap-2 px-4 py-3 text-left",
              "transition-colors duration-150",
              i > 0 && "border-l border-hairline",
              selected ? "bg-ink text-paper" : "hover:bg-wash",
            )}
          >
            <span
              className={cn(
                "text-[0.6rem] tabular-nums tracking-[0.18em]",
                selected ? "text-paper/60" : "text-ink-40",
              )}
            >
              {tab.index}
            </span>
            <span className="text-xs uppercase tracking-[0.18em]">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: React.ReactNode;
}) {
  if (id !== active) return null;
  return (
    <section
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="rise"
    >
      {children}
    </section>
  );
}
