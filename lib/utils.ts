// Tiny class joiner — no dependency needed for our use.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const usd = (n: number, fractionDigits = 0): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
  });

export const tons = (n: number): string =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} tCO₂e`;

export const compact = (n: number): string =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
