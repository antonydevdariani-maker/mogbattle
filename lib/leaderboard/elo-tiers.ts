/** Right edge of the ladder graphic (Adam lite continues beyond in ranking). */
export const ELO_GRAPH_MAX = 2200;

/** Partition points: band i is [stops[i], stops[i+1]) except the last includes stops[i+1]. */
const STOPS = [0, 451, 800, 1000, 1200, 1600, 1800, 2200] as const;

export type EloTierBand = {
  min: number;
  max: number;
  abbr: string;
  full: string;
  barClass: string;
};

export const ELO_TIER_BANDS: EloTierBand[] = [
  {
    min: 0,
    max: 450,
    abbr: "SUB 5",
    full: "Sub 5",
    barClass: "bg-zinc-700",
  },
  {
    min: 451,
    max: 799,
    abbr: "LTN",
    full: "Low tier normie",
    barClass: "bg-zinc-500/80",
  },
  {
    min: 800,
    max: 999,
    abbr: "MTN",
    full: "Mid tier normie",
    barClass: "bg-cyan-700/70",
  },
  {
    min: 1000,
    max: 1199,
    abbr: "HTN",
    full: "High tier normie",
    barClass: "bg-cyan-500/60",
  },
  {
    min: 1200,
    max: 1599,
    abbr: "CHAD LITE",
    full: "Chad lite",
    barClass: "bg-fuchsia-600/55",
  },
  {
    min: 1600,
    max: 1799,
    abbr: "CHAD",
    full: "Chad",
    barClass: "bg-amber-500/50",
  },
  {
    min: 1800,
    max: ELO_GRAPH_MAX,
    abbr: "ADAM LITE",
    full: "Adam lite",
    barClass: "bg-amber-200/35",
  },
];

export function tierForElo(elo: number): EloTierBand {
  const e = Number.isFinite(elo) ? elo : 0;
  if (e >= 1800) return ELO_TIER_BANDS[6];
  if (e >= 1600) return ELO_TIER_BANDS[5];
  if (e >= 1200) return ELO_TIER_BANDS[4];
  if (e >= 1000) return ELO_TIER_BANDS[3];
  if (e >= 800) return ELO_TIER_BANDS[2];
  if (e >= 451) return ELO_TIER_BANDS[1];
  return ELO_TIER_BANDS[0];
}

export function segmentWidthPercent(index: number): number {
  const lo = STOPS[index];
  const hi = STOPS[index + 1];
  return ((hi - lo) / ELO_GRAPH_MAX) * 100;
}

/** 0–100 on the graphic; values above scale max pin to 100%. */
export function eloToPercentOnGraph(elo: number): number {
  const e = Number.isFinite(elo) ? elo : 0;
  return Math.min(100, Math.max(0, (e / ELO_GRAPH_MAX) * 100));
}
