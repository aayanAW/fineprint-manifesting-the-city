"use client";

import { useEffect, useState } from "react";
import { Masthead } from "@/components/dashboard/Masthead";
import { SearchBar } from "@/components/dashboard/SearchBar";
import { Verdict } from "@/components/dashboard/Verdict";
import { CliffChart } from "@/components/dashboard/CliffChart";
import { FinesTable } from "@/components/dashboard/FinesTable";
import { ProvenanceFootnote } from "@/components/dashboard/ProvenanceFootnote";
import { RetrofitSection } from "@/components/dashboard/RetrofitSection";
import { AskPanel } from "@/components/dashboard/AskPanel";
import { CityBoard } from "@/components/dashboard/CityBoard";
import { TabBar, TabPanel, type TabDef } from "@/components/ui/tabs";
import { fetchBuilding, type BuildingResult } from "@/lib/client/api";
import { DEMO_BUILDINGS, findDemoBuilding } from "@/lib/mock";

const TABS: TabDef[] = [
  { id: "verdict", label: "The verdict", index: "01" },
  { id: "retrofit", label: "The way out", index: "02" },
  { id: "ask", label: "Ask the law", index: "03" },
  { id: "city", label: "Citywide", index: "04" },
];

export default function Home() {
  const [result, setResult] = useState<BuildingResult>(DEMO_BUILDINGS[0]);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("verdict");

  // Deep-linkable sections (?tab=retrofit). Read once after mount; keep the
  // URL in sync on change without polluting history.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, []);

  function selectTab(id: string) {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  async function search(address: string) {
    setLoading(true);
    setError(null);
    try {
      const live = await fetchBuilding(address);
      setResult(live);
      setSource("live");
      setTab("verdict");
    } catch (e) {
      const demo = findDemoBuilding(address);
      if (demo) {
        setResult({ facts: demo.facts, fines: demo.fines });
        setSource("demo");
        setTab("verdict");
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-10 px-5 py-10 sm:px-8">
      <Masthead />

      <div className="rise rise-2">
        <SearchBar onSearch={search} loading={loading} />
        {error && (
          <p role="alert" className="mt-3 text-xs text-ink-60">
            {error}
          </p>
        )}
      </div>

      <div className="rise rise-3">
        <TabBar tabs={TABS} active={tab} onSelect={selectTab} />
      </div>

      <main className="flex-1" aria-busy={loading}>
        <TabPanel id="verdict" active={tab}>
          <div className="space-y-12">
            {source === "demo" && (
              <p className="legal-label" role="status">
                Demo ledger entry · search to pull live city data
              </p>
            )}
            <Verdict facts={result.facts} fines={result.fines} />
            <CliffChart fines={result.fines} />
            <FinesTable fines={result.fines} />
            <ProvenanceFootnote facts={result.facts} fines={result.fines} />
          </div>
        </TabPanel>

        <TabPanel id="retrofit" active={tab}>
          <RetrofitSection facts={result.facts} fines={result.fines} />
        </TabPanel>

        <TabPanel id="ask" active={tab}>
          <AskPanel />
        </TabPanel>

        <TabPanel id="city" active={tab}>
          <CityBoard />
        </TabPanel>
      </main>

      <footer className="rise rise-5 border-t border-hairline pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="legal-label">
            FinePrint · Manifesting the City · #NYTechWeek
          </p>
          <p className="text-[0.65rem] text-ink-40">
            A deterministic engine computes every number; the AI only explains.
          </p>
        </div>
      </footer>
    </div>
  );
}
