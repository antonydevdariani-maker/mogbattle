import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  // No certificate — Agora no-auth mode (Primary Certificate disabled in Agora console).
  // Both players join the same channel using the matchId as the channel name.
  return NextResponse.json({ sessionId: matchId, token: null, apiKey: APP_ID });
}
