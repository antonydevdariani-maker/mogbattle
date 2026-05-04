// eslint-disable-next-line @typescript-eslint/no-require-imports
const OpenTok = require("opentok") as new (appId: string, key: string) => any;
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const privateKey = process.env.VONAGE_PRIVATE_KEY!.replace(/\\n/g, "\n");
const appId = process.env.VONAGE_APP_ID!;

const ot = new OpenTok(appId, privateKey);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    ot.createSession({ mediaMode: "routed" }, (err: any, session: any) => {
      if (err || !session) {
        console.error("Vonage session error:", err);
        resolve(NextResponse.json({ error: "session create failed" }, { status: 500 }));
        return;
      }

      const token = ot.generateToken(session.sessionId, {
        role: "publisher",
        expireTime: Math.floor(Date.now() / 1000) + 7200,
        data: `matchId=${matchId}`,
      });

      resolve(
        NextResponse.json({
          sessionId: session.sessionId,
          token,
          apiKey: appId,
        })
      );
    });
  });
}
