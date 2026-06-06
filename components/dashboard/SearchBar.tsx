"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMO_BUILDINGS,
  findDemoBuilding,
  type DemoBuilding,
} from "@/lib/mock";

export function SearchBar({
  onResult,
}: {
  onResult: (b: DemoBuilding) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const hit = findDemoBuilding(query);
    if (!hit) {
      setError(
        `No entry for "${query}" in the demo ledger. Try one of the listed buildings below.`,
      );
      return;
    }
    setError(null);
    onResult(hit);
  }

  return (
    <div className="rise rise-1">
      <p className="legal-label">Look up a covered building</p>
      <form onSubmit={submit} className="mt-2 flex items-end gap-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a NYC address…"
          aria-label="NYC building address"
        />
        <Button type="submit" className="shrink-0">
          Pull the ledger
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-xs text-ink-60">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {DEMO_BUILDINGS.map((b) => (
          <button
            key={b.slug}
            type="button"
            onClick={() => {
              setQuery(b.facts.address);
              setError(null);
              onResult(b);
            }}
            className="text-[0.7rem] text-ink-40 underline decoration-ink-20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
          >
            {b.facts.address}
          </button>
        ))}
      </div>
    </div>
  );
}
