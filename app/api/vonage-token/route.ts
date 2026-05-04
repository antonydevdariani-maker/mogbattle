import { RtcTokenBuilder, RtcRole } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");
  const uid = parseInt(searchParams.get("uid") ?? "0", 10);

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  // matchId is the channel name — both players use the same channel
  const channel = matchId;

  let token: string | null = null;
  if (APP_CERT) {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channel,
      uid,
      RtcRole.PUBLISHER,
      expiry,
      expiry
    );
  }

  // Return shape matches VonageCredentials so arena-client needs no changes
  return NextResponse.json({ sessionId: channel, token, apiKey: APP_ID });
}
