"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FineResult } from "@/lib/ll97/engine";

// Monochrome cliff chart. Over-limit bars are hatched (print's danger signal);
// compliant bars are wash-filled with a hairline stroke. Limit lines dashed ink.
const INK = "#111110";
const INK40 = "#8a8a84";
const WASH = "#f3f3ee";

export function CliffChart({ fines }: { fines: FineResult[] }) {
  if (fines.length === 0) return null;
  const data = fines.map((f) => ({
    period: f.period,
    emissions: f.actualEmissionsTco2e,
    limit: f.emissionsLimitTco2e,
    over: !f.compliant,
  }));
  const cp1 = fines[0].emissionsLimitTco2e;
  const cp2 = fines[1]?.emissionsLimitTco2e ?? cp1;

  return (
    <figure
      aria-label="Emissions versus the legal limit, by compliance period"
      className="h-80 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 28, right: 12, left: 4, bottom: 4 }}
          barCategoryGap="28%"
        >
          <defs>
            <pattern
              id="fp-hatch"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <rect width="5" height="5" fill={WASH} />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="5"
                stroke={INK}
                strokeWidth="1.4"
              />
            </pattern>
          </defs>
          <XAxis
            dataKey="period"
            tick={{
              fontSize: 11,
              fill: INK,
              fontFamily: "var(--font-spline-mono)",
            }}
            axisLine={{ stroke: INK }}
            tickLine={false}
          />
          <YAxis
            tick={{
              fontSize: 10,
              fill: INK40,
              fontFamily: "var(--font-spline-mono)",
            }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v: number) => v.toLocaleString("en-US")}
          />
          <Tooltip
            cursor={{ fill: "rgba(17,17,16,0.04)" }}
            contentStyle={{
              background: "#fcfcfa",
              border: `1px solid ${INK}`,
              borderRadius: 0,
              fontSize: 11,
              fontFamily: "var(--font-spline-mono)",
            }}
            formatter={(v) => [
              `${Number(v).toLocaleString("en-US")} tCO₂e`,
              "emissions",
            ]}
          />
          <ReferenceLine
            y={cp1}
            stroke={INK40}
            strokeDasharray="2 4"
            label={{
              value: `2024 limit · ${cp1.toLocaleString("en-US")}`,
              position: "insideTopRight",
              fontSize: 10,
              fill: INK40,
              fontFamily: "var(--font-spline-mono)",
            }}
          />
          <ReferenceLine
            y={cp2}
            stroke={INK}
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: `2030 limit · ${cp2.toLocaleString("en-US")}`,
              position: "insideBottomRight",
              fontSize: 10,
              fill: INK,
              fontFamily: "var(--font-spline-mono)",
            }}
          />
          <Bar
            dataKey="emissions"
            isAnimationActive={false}
            stroke={INK}
            strokeWidth={1}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.over ? "url(#fp-hatch)" : WASH} />
            ))}
            <LabelList
              dataKey="emissions"
              position="top"
              formatter={(v) => Number(v).toLocaleString("en-US")}
              style={{
                fontSize: 11,
                fill: INK,
                fontFamily: "var(--font-spline-mono)",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <figcaption className="sr-only">
        Bars show annual emissions per compliance period; hatched bars exceed
        the legal limit. Dashed lines mark the 2024 and 2030 limits.
      </figcaption>
    </figure>
  );
}
