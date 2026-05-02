import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM = `You are an expert facial aesthetics consultant and maxillofacial analyst. You provide brutally honest, highly detailed, actionable face reports. Your analysis is clinical, specific, and never vague. Cover every metric that matters. Format your response as a single JSON object — no markdown, no code blocks.`;

const PROMPT = `Analyze the provided face photo(s) and return a comprehensive JSON report with exactly this structure:

{
  "psl": <overall PSL score 1.0-10.0, one decimal>,
  "tier": "<sub5|ltn|mtn|htn|chadlite|chad>",
  "overallVerdict": "<2-3 sentence honest summary>",

  "faceShape": "<oval|round|square|heart|diamond|oblong|triangle — and brief description>",
  "symmetry": <0-100 symmetry percentage>,
  "facialThirds": "<analysis of upper/mid/lower thirds balance>",

  "features": {
    "eyes": {
      "score": <1-10>,
      "canthalTilt": "<positive|neutral|negative — degrees approximate>",
      "spacing": "<wide|ideal|close>",
      "shape": "<almond|round|hooded|deep-set|etc>",
      "notes": "<specific observations>"
    },
    "nose": {
      "score": <1-10>,
      "width": "<narrow|ideal|wide>",
      "projection": "<underprojected|ideal|overprojected>",
      "tip": "<refined|bulbous|upturned|downturned>",
      "notes": "<specific observations>"
    },
    "jaw": {
      "score": <1-10>,
      "definition": "<sharp|moderate|weak>",
      "gonialAngle": "<acute|ideal|obtuse>",
      "width": "<narrow|ideal|wide>",
      "notes": "<specific observations>"
    },
    "chin": {
      "score": <1-10>,
      "projection": "<recessed|ideal|prominent>",
      "shape": "<round|square|pointed|cleft>",
      "notes": "<specific observations>"
    },
    "cheekbones": {
      "score": <1-10>,
      "prominence": "<flat|moderate|prominent|very prominent>",
      "width": "<narrow|ideal|wide>",
      "notes": "<specific observations>"
    },
    "lips": {
      "score": <1-10>,
      "upperToLowerRatio": "<thin-thin|thin-full|full-full|etc>",
      "philtrum": "<short|ideal|long>",
      "notes": "<specific observations>"
    },
    "skin": {
      "score": <1-10>,
      "texture": "<smooth|mild texture|moderate texture|rough>",
      "visibleIssues": ["<list any: acne, scarring, hyperpigmentation, redness, etc — or 'none'>"],
      "notes": "<specific observations>"
    },
    "hair": {
      "score": <1-10>,
      "notes": "<hairline, density, style suitability>"
    }
  },

  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<specific weakness 1>", "<specific weakness 2>", "<specific weakness 3>"],

  "improvements": {
    "immediate": ["<free/lifestyle change — grooming, lighting, style, posture>"],
    "noninvasive": ["<dermatology, skincare, mewing, bone smashing, face yoga, etc>"],
    "medical": ["<filler, botox, rhinoplasty, jaw surgery, etc — only mention if genuinely applicable>"]
  },

  "photoQuality": "<good|acceptable|poor — and brief note on angle/lighting>",
  "confidenceScore": <0-100 — how confident you are in this analysis given photo quality>
}

PSL tier guide: sub5 (<5.0), ltn (5.0-5.49), mtn (5.5-5.99), htn (6.0-6.49), chadlite (6.5-6.99), chad (7.0+).

Be specific and honest. No empty fields. If something is not clearly visible, note it but still give your best assessment.`;

export async function POST(req: NextRequest) {
  try {
    const { frontImage, sideImage } = await req.json() as { frontImage: string; sideImage?: string };
    if (!frontImage || typeof frontImage !== "string") {
      return NextResponse.json({ error: "Front image required" }, { status: 400 });
    }

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "image_url", image_url: { url: frontImage } },
    ];
    if (sideImage && typeof sideImage === "string") {
      content.push({ type: "image_url", image_url: { url: sideImage } });
      content.push({ type: "text", text: "First image is front-facing. Second image is side profile." });
    }
    content.push({ type: "text", text: PROMPT });

    const response = await client.chat.completions.create({
      model: "qwen/qwen2.5-vl-72b-instruct",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      max_tokens: 1200,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("face-report error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
