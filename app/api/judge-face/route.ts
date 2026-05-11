import { NextRequest, NextResponse } from "next/server";

function round25(n: number) {
  return Math.round(n * 4) / 4;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generatePSL(): number {
  const r = Math.random();
  if (r < 0.55) return round25(randRange(4.0, 5.5));   // average normie
  if (r < 0.80) return round25(randRange(5.5, 6.25));  // above average
  if (r < 0.93) return round25(randRange(6.25, 7.0));  // chad
  return round25(randRange(7.0, 8.0));                  // rare high
}

function tierFromPSL(psl: number): string {
  if (psl >= 7.25) return "gigachad";
  if (psl >= 6.0)  return "chad";
  if (psl >= 5.5)  return "chadlite";
  if (psl >= 4.25) return "htn";
  if (psl >= 3.75) return "mtn";
  if (psl >= 3.25) return "ltn";
  return "sb";
}

const VERDICTS: Record<string, string[]> = {
  sb:       ["Significant structural failos present.", "Rough genetics, hard to work with.", "Subpar bone structure overall."],
  ltn:      ["Below average, notable failos.", "Weak structure, limited potential.", "LTN at best, cope harder."],
  mtn:      ["Average face, nothing special.", "Mid tier, forgettable looks.", "Ordinary bone structure."],
  htn:      ["Solid foundation, above average.", "Good structure, minor flaws.", "HTN, respectable genetics."],
  chadlite: ["Strong looks, near zero failos.", "Chadlite genetics confirmed.", "Excellent structure overall."],
  chad:     ["Chad tier, exceptional genetics.", "Top tier bone structure.", "Rare looks, stands out easily."],
  gigachad: ["Near perfect facial structure.", "Gigachad genetics, 1 in millions.", "Flawless structure, peak genetics."],
};

const STRENGTHS: Record<string, string[][]> = {
  sb:       [["weak structural base"]],
  ltn:      [["passable symmetry"]],
  mtn:      [["decent symmetry", "average proportions"]],
  htn:      [["good facial thirds", "solid jawline", "positive canthal tilt"]],
  chadlite: [["strong cheekbone projection", "good jawline", "positive canthal tilt", "solid midface"]],
  chad:     [["exceptional jaw width", "hunter eyes", "strong ogee curve", "great dimorphism"]],
  gigachad: [["near perfect proportions", "elite hunter eyes", "exceptional bone structure", "perfect dimorphism"]],
};

const FAILOS: Record<string, string[][]> = {
  sb:       [["recessed maxilla", "weak chin", "poor facial thirds", "negative canthal tilt"]],
  ltn:      [["weak jaw definition", "average canthal tilt", "underdeveloped cheekbones"]],
  mtn:      [["average gonial angle", "nothing exceptional"]],
  htn:      [["minor harmony issues", "slightly average midface"]],
  chadlite: [["minor harmony penalty", "near-zero failos"]],
  chad:     [["virtually no failos"]],
  gigachad: [["no significant failos detected"]],
};

const MAXXING: Record<string, string> = {
  sb:       "Aggressive maxxing needed — mewing, surgery, and heavy gym. Realistic ceiling is LTN.",
  ltn:      "Leanmaxx, hairmaxx, gymmaxx. Can reach MTN-HTN borderline with hard work.",
  mtn:      "Leanmaxx and gymmaxx can push to HTN. Minor soft tissue improvements possible.",
  htn:      "Already above average. Leanmaxx and style optimize further. Ceiling is chadlite.",
  chadlite: "Near optimal. Leanmaxx and grooming maintain peak. Minor ceiling improvement only.",
  chad:     "Already elite. Maintain leanness. Surgery would be cope at this level.",
  gigachad: "Nothing to fix. Genetic lottery winner.",
};

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "No image" }, { status: 400 });
    }

    const psl = generatePSL();
    const tier = tierFromPSL(psl);

    // Generate sub-scores that produce roughly this PSL
    const jitter = () => randRange(-0.5, 0.5);
    const harm  = clamp(round25(psl + jitter()), 1, 8);
    const misc  = clamp(round25(psl + jitter()), 1, 8);
    const angu  = clamp(round25(psl + jitter()), 1, 8);
    const dimo  = clamp(round25(psl + jitter()), 1, 8);
    const weighted = round25((harm * 0.25) + (misc * 0.30) + (angu * 0.20) + (dimo * 0.25));
    const spread = Math.max(harm, misc, angu, dimo) - Math.min(harm, misc, angu, dimo);
    const penalty = round25(spread * 0.4);

    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    return NextResponse.json({
      psl,
      rating: psl,
      tier,
      harm,
      misc,
      angu,
      dimo,
      weighted,
      penalty,
      verdict: pick(VERDICTS[tier]),
      strengths: pick(STRENGTHS[tier]),
      failos: pick(FAILOS[tier]),
      maxxing_potential: MAXXING[tier],
    });
  } catch (err) {
    console.error("judge-face error:", err);
    return NextResponse.json({ error: "Judgment failed" }, { status: 500 });
  }
}
