import { RtcTokenBuilder, RtcRole } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  const expiry = Math.floor(Date.now() / 1000) + 3600;
  // uid=0 = wildcard token — works for any UID joining the channel
  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    matchId,
    0,
    RtcRole.PUBLISHER,
    expiry,
    expiry
  );

  return NextResponse.json({ sessionId: matchId, token, apiKey: APP_ID });
}
