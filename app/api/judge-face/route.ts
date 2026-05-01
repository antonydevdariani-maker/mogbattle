import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "No image" }, { status: 400 });
    }

    // Strip data URL prefix to get raw base64
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64,
        },
      },
      `You are an expert PSL (Looks Scale) facial aesthetics judge. Analyze the face using the official PSL rating system.

PSL RATING CRITERIA — judge these 6 factors:
1. Facial Harmony & Balance (proportions, golden ratio adherence)
2. Symmetry (left/right facial symmetry)
3. Sexual Dimorphism (strong jaw, brow ridge, cheekbones for males; soft features, high cheekbones for females)
4. Unique/Striking Features (memorable, model-quality distinctiveness)
5. Averageness (closeness to mathematical facial average — higher averageness = higher baseline)
6. Individual Feature Quality (eyes, nose, lips, jaw, chin, orbital area, skin quality)

PSL SCALE — use this distribution (most people are 3.5–4.5):
- <2: Extreme deformities or severe disfigurement. Almost no facial harmony.
- 2–3: Very unattractive. Major failos, near-zero harmony. (e.g. Steve Buscemi ~3)
- 3–3.5: Noticeably below average. Clear asymmetry/poor ratios. (e.g. Michael Cera ~3)
- 4: Dead average. Nothing stands out. Most common rating. (e.g. Omar Epps, Shia LaBeouf ~4)
- 4.5: Above average. Decent ratios, acceptable features. (e.g. Tom Holland ~4.5)
- 5: Attractive to many. Good harmony, minor failos holding back. (e.g. Timothée Chalamet ~5)
- 5.5: Very good looking, stands out daily. Strong jaw or great soft features. (e.g. Chris Evans ~5.5)
- 6: Model tier entry. Great harmony, sexually dimorphic, classically handsome/beautiful. 1–2 minor failos max. (e.g. Henry Cavill ~6, Johnny Depp ~6)
- 6.5: Extremely attractive. No real failos. Every feature top-tier. (e.g. Zayn Malik ~6.5, Chris Hemsworth ~6.5)
- 7: Among best in world. Near-perfect symmetry, incredible bone structure, unique. (e.g. Tom Cruise ~7, Matt Bomer ~7)
- 7.5: Near-perfect. Rarest rating. Only a handful alive. (e.g. David Gandy ~7.5)
- 8+: Human perfection. Essentially impossible. Do NOT assign unless face is objectively flawless in every dimension.

IMPORTANT CALIBRATION:
- Be honest and realistic. The average person is 3.5–4.5, NOT 6–7.
- PSL is NOT a popularity or appeal score — it measures facial aesthetics objectively.
- A "failos" is any feature that detracts: weak chin, poor orbital area, asymmetry, low cheekbones, bad nose tip, etc.
- Count failos carefully. Each significant failo drops rating by ~0.5.

Respond ONLY with valid JSON, no markdown, no code blocks:
{"psl": <number 1-8 one decimal>, "rating": <number 1-10 one decimal>, "verdict": "<brief honest aesthetic assessment max 15 words>", "failos": "<main detractors if any, or 'none'>", "strengths": "<top facial strengths>"}

If no face visible: {"psl": 0, "rating": 0, "verdict": "No face detected", "failos": "n/a", "strengths": "n/a"}`,
    ]);

    const text = result.response.text().trim();
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("judge-face error:", err);
    return NextResponse.json({ error: "AI judgment failed" }, { status: 500 });
  }
}
