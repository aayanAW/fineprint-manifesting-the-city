"use client";

import { useState } from "react";
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
import {
  DEMO_BUILDINGS,
  MOCK_RETROFIT_PLAN,
  MOCK_ADVICE,
  type DemoBuilding,
} from "@/lib/mock";

const TABS: TabDef[] = [
  { id: "verdict", label: "The verdict", index: "01" },
  { id: "retrofit", label: "The way out", index: "02" },
  { id: "ask", label: "Ask the law", index: "03" },
  { id: "city", label: "Citywide", index: "04" },
];

export default function Home() {
  const [building, setBuilding] = useState<DemoBuilding>(DEMO_BUILDINGS[0]);
  const [tab, setTab] = useState("verdict");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-10 px-5 py-10 sm:px-8">
      <Masthead />

      <div className="rise rise-2">
        <SearchBar
          onResult={(b) => {
            setBuilding(b);
            setTab("verdict");
          }}
        />
      </div>

      <div className="rise rise-3">
        <TabBar tabs={TABS} active={tab} onSelect={setTab} />
      </div>

      <main className="flex-1">
        <TabPanel id="verdict" active={tab}>
          <div className="space-y-12">
            <Verdict facts={building.facts} fines={building.fines} />
            <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr]">
              <CliffChart fines={building.fines} />
              <FinesTable fines={building.fines} />
            </div>
            <ProvenanceFootnote facts={building.facts} fines={building.fines} />
          </div>
        </TabPanel>

        <TabPanel id="retrofit" active={tab}>
          <RetrofitSection plan={MOCK_RETROFIT_PLAN} advice={MOCK_ADVICE} />
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
            Demo data. Engine: deterministic LL97 math, golden-tested against
            DOB's worked example.
          </p>
        </div>
      </footer>
    </div>
  );
}
