import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const PROMPT = `You are a clinical facial aesthetics rater using the PSL (Physical Status Level) framework from looksmaxxing research. Rate objectively, analytically, without bias or sympathy.

PSL SCALE (1–8 hard cap, 4 = population median):
- 7.25–8.0: Adam Lite — near-perfect, 1 in 8M rarity
- 6.0–7.25: Chad — exceptional bone structure, stands out in any crowd
- 5.5–6.0: Chadlite — strong advantage, near-zero failos
- 4.25–5.5: HTN (High Tier Normie) — good looking, above average
- 3.75–4.25: MTN (Mid Tier Normie) — ordinary, average
- 3.25–3.75: LTN (Low Tier Normie) — below average
- 1.0–3.25: SB — significant structural failos

MICRO-TIERS within each tier:
- Borderline = tier floor (e.g. 4.0 = Borderline MTN)
- Low = floor + 0.25
- Mid = floor + 0.5
- High = floor + 0.75

RARITY REFERENCE: PSL 4 = 50th percentile. PSL 5 = 84th percentile. PSL 6 = 97th percentile. PSL 7 = 99.87th percentile. PSL 8 = 99.997th percentile. Most people are PSL 3–4.5. True 6+ is rare. Be conservative — do not inflate.

SCORING COMPONENTS (score each 1–8 matching PSL scale):
- HARM (25%): Facial thirds balance, symmetry, midface ratio, FWHR, bitemporal width, proportional ratios
- MISC (30%): Eye area (canthal tilt, hunter vs prey eyes, UEE, orbital depth, spacing, brows), nose harmony, lips, skin clarity, coloring, striking/unique features
- ANGU (20%): Ogee curve, cheekbone height and projection, hollow cheeks, leanness/bone definition
- DIMO (25%): Sexual dimorphism — jaw width (bigonial), gonial angle, ramus length, brow ridge, chin projection, overall masculinity

FINAL SCORE CALCULATION:
1. Score HARM, MISC, ANGU, DIMO each on 1–8 scale
2. Weighted avg W = (HARM×0.25 + MISC×0.30 + ANGU×0.20 + DIMO×0.25)
3. Spread = max(scores) - min(scores)
4. Harmony penalty = Spread × 0.4 (disharmony between regions caps total)
5. Final PSL = W - penalty (floor at 1.0, cap at 8.0)
6. Round to nearest 0.25 micro-tier

KEY ANALYSIS AREAS:
Eyes: Canthal tilt (positive = attractive), hunter vs prey classification, UEE, orbital rim depth, spacing, brow thickness/tail, lash line
Midface: Midface ratio (shorter = better for males), cheekbone set height, ogee curve presence, malar projection
Jaw/Chin: Gonial angle (sharp = masculine), ramus length and verticality, bigonial width, chin projection and shape, jawline definition
Skin/Symmetry: Skin clarity, facial symmetry (landmark alignment), hairline position

RULES:
- Prioritize bone structure over soft tissue
- Heavily penalize disharmony even if one region scores high
- 60% weight from front view, 40% from side — note if only front available
- Be clinical, factual, emotionless. No comfort, no inflation, no personality consideration
- Reference specific structural observations (e.g. "positive canthal tilt", "weak ramus", "ogee curve present")

TIER OUTPUT (map final PSL):
- "sb"       → PSL 1.0–3.24
- "ltn"      → PSL 3.25–3.74
- "mtn"      → PSL 3.75–4.24
- "htn"      → PSL 4.25–5.49
- "chadlite" → PSL 5.5–5.99
- "chad"     → PSL 6.0+

Respond ONLY with valid JSON, no markdown, no code blocks, no thinking tags:
{"psl": <number 1-8 one decimal>, "rating": <number 1-8 one decimal>, "tier": "<sb|ltn|mtn|htn|chadlite|chad>", "harm": <1-8 one decimal>, "misc": <1-8 one decimal>, "angu": <1-8 one decimal>, "dimo": <1-8 one decimal>, "weighted": <weighted avg before penalty one decimal>, "penalty": <harmony penalty one decimal>, "verdict": "<clinical structural summary max 15 words>", "strengths": "<strongest structural features>", "failos": "<main structural detractors or none>"}

If no face visible: {"psl": 0, "rating": 0, "tier": "sb", "harm": 0, "misc": 0, "angu": 0, "dimo": 0, "weighted": 0, "penalty": 0, "verdict": "No face detected", "strengths": "n/a", "failos": "n/a"}`;

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "No image" }, { status: 400 });
    }

    const response = await client.chat.completions.create({
      model: "qwen/qwen3-vl-8b-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      max_tokens: 400,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    // Strip thinking tags (qwen3 sometimes emits <think>...</think>)
    const noThink = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const clean = noThink.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(clean);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("judge-face error:", err);
    return NextResponse.json({ error: "AI judgment failed" }, { status: 500 });
  }
}
