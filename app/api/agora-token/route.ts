import { RtcTokenBuilder, RtcRole } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

export async function GET(req: NextRequest) {
  const APP_CERT = process.env.AGORA_APP_CERTIFICATE;
  const { searchParams } = req.nextUrl;
  const channel = searchParams.get("channel");
  const uid = parseInt(searchParams.get("uid") ?? "0", 10);

  if (!channel) return NextResponse.json({ error: "missing channel" }, { status: 400 });

  // No certificate → no-auth mode (Primary Certificate disabled on Agora console).
  if (!APP_CERT) return NextResponse.json({ token: null });

  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERT, channel, uid, RtcRole.PUBLISHER, expiry, expiry);

  return NextResponse.json({ token });
}
