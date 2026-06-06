"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_BUILDINGS } from "@/lib/mock";

export function SearchBar({
  onSearch,
  loading,
}: {
  onSearch: (address: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");

  return (
    <div className="rise rise-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) onSearch(query.trim());
        }}
        className="flex items-end gap-6"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a NYC address…"
          aria-label="NYC building address"
        />
        <Button type="submit" disabled={loading} className="shrink-0">
          {loading ? "Pulling…" : "Pull the ledger"}
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <span className="legal-label">Try</span>
        {DEMO_BUILDINGS.map((b) => (
          <button
            key={b.slug}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuery(b.facts.address);
              onSearch(b.facts.address);
            }}
            className="text-[0.7rem] text-ink-40 underline decoration-ink-20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-50"
          >
            {b.facts.address}
          </button>
        ))}
      </div>
    </div>
  );
}
