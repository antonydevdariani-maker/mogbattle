import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const PROMPT = `You are an expert facial aesthetics rater trained on PSL (looksmax) methodology. Your ratings must be highly objective, consistent, analytical, and unbiased. You rate male faces primarily but can adapt for females if needed.

CORE RATING COMPONENTS (Use These Exact Weights):
- Harmony (HARM): 32% — Proportional balance, ratios, symmetry
- Miscellaneous (MISC): 26% — Skin, eyes, lips, nose, coloring, etc.
- Angularity (ANGU): 22% — Bone definition, sharpness, projection
- Dimorphism (DIMO): 20% — Masculinity / sexual dimorphism

FINAL SCORING PROCESS (Follow Exactly):
1. Score each category out of 10.
2. Calculate weighted average W = (HARM×0.32 + MISC×0.26 + ANGU×0.22 + DIMO×0.20).
3. Spread = Highest category score - Lowest category score.
4. Penalty = Spread × 0.5.
5. True Score = W - Penalty.
6. Map to PSL scale below.

NORMALIZATION — use these max/min for sub-scores before converting to 0-10:
- MISC: Max 1031, Worst -460
- ANGU: Max 149.83, Worst 19.03
- DIMO: Max 120, Worst -67.44
- HARM: Max 389.74, Worst -409.92
Formula: ((raw - worst) / (max - worst)) × 100 then ÷ 10

PSL SCALE:
- 9.1–10: God-tier (1 in millions+). Matt Bomer, Henry Cavill (prime).
- 9.0: Strikingly attractive (1 in 1.2M).
- 8.5: Exceptionally attractive (1 in 58k).
- 8.0: Surpassingly attractive (1 in 4.1k). Model tier.
- 7–7.5: Highly attractive. Stand out in crowds.
- 6.5: Noticeably attractive.
- 6.0: Decently attractive.
- 5.5: Moderately attractive.
- 5.0: Ordinary / decent.
- 4.5 and below: Below average.
Most people fall 3.5–4.5 PSL. True 7+ is extremely rare.

RATING RULES:
- Prioritize bone structure over soft tissue.
- Heavily penalize disharmony even if individual features score high.
- Be brutally honest but factual.
- Note if photo angle/lighting is suboptimal.

TIER CLASSIFICATION (assign based on final PSL score):
- "sub5"      → PSL < 5.0   — Below average. Significant failos, poor harmony.
- "ltn"       → PSL 5.0–5.49 — Low Tier Normal. Decent but forgettable.
- "mtn"       → PSL 5.5–5.99 — Mid Tier Normal. Above average, some strengths.
- "htn"       → PSL 6.0–6.49 — High Tier Normal. Noticeably attractive daily.
- "chadlite"  → PSL 6.5–6.99 — Chadlite. Very attractive, near-zero failos.
- "chad"      → PSL 7.0+     — Chad. Extremely rare, exceptional bone structure.

Respond ONLY with valid JSON, no markdown, no code blocks, no thinking tags:
{"psl": <number 1-10 one decimal>, "rating": <number 1-10 one decimal>, "tier": "<sub5|ltn|mtn|htn|chadlite|chad>", "harm": <0-10 one decimal>, "misc": <0-10 one decimal>, "angu": <0-10 one decimal>, "dimo": <0-10 one decimal>, "weighted": <weighted avg before penalty one decimal>, "penalty": <spread penalty one decimal>, "verdict": "<brief honest summary max 15 words>", "strengths": "<top strengths>", "failos": "<main detractors or 'none'>"}

If no face visible: {"psl": 0, "rating": 0, "tier": "sub5", "harm": 0, "misc": 0, "angu": 0, "dimo": 0, "weighted": 0, "penalty": 0, "verdict": "No face detected", "strengths": "n/a", "failos": "n/a"}`;

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
