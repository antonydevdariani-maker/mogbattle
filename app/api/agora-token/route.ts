import { RtcTokenBuilder, RtcRole } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const channel = searchParams.get("channel");
  const uid = parseInt(searchParams.get("uid") ?? "0", 10);

  if (!channel) return NextResponse.json({ error: "missing channel" }, { status: 400 });
  if (!APP_CERT) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERT, channel, uid, RtcRole.PUBLISHER, expiry, expiry);

  return NextResponse.json({ token });
}
