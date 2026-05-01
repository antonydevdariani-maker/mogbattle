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
      `You are a facial aesthetics AI judge. Analyze this face and score it objectively.
PSL scale: 1-4 below average, 5 average, 6-7 above average, 8-9 very attractive, 10 perfect.
Rating: overall attractiveness out of 10.

Respond ONLY with valid JSON, no markdown, no code blocks:
{"psl": <number 1-10 one decimal>, "rating": <number 1-10 one decimal>, "verdict": "<10 words max>"}

If no face visible: {"psl": 0, "rating": 0, "verdict": "No face detected"}`,
    ]);

    const text = result.response.text().trim();
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("judge-face error:", err);
    return NextResponse.json({ error: "AI judgment failed" }, { status: 500 });
  }
}
