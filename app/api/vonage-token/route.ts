import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface OTSession { sessionId: string }
interface OTError { message: string; code: number }
interface OpenTokInstance {
  createSession(
    options: { mediaMode: string },
    callback: (err: OTError | null, session: OTSession | undefined) => void
  ): void;
  generateToken(
    sessionId: string,
    options: { role: string; expireTime: number; data: string }
  ): string;
}

const apiKey = process.env.VONAGE_API_KEY!;
const apiSecret = process.env.VONAGE_API_SECRET!;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OpenTok = require("opentok") as new (apiKey: string, apiSecret: string) => OpenTokInstance;
const ot = new OpenTok(apiKey, apiSecret);

function createVonageSession(): Promise<string> {
  return new Promise((resolve, reject) => {
    ot.createSession({ mediaMode: "routed" }, (err, session) => {
      if (err || !session) reject(err ?? new Error("no session"));
      else resolve(session.sessionId);
    });
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Read existing session for this match
  const { data: match } = await supabase
    .from("matches")
    .select("vonage_session_id")
    .eq("id", matchId)
    .single();

  if (!match) {
    return NextResponse.json({ error: "match not found" }, { status: 404 });
  }

  let sessionId = match.vonage_session_id as string | null;

  // Create session once — first caller wins, second caller reads it
  if (!sessionId) {
    try {
      const newSessionId = await createVonageSession();

      // Upsert: only write if still null (prevents race where both players create simultaneously)
      const { data: updated } = await supabase
        .from("matches")
        .update({ vonage_session_id: newSessionId })
        .eq("id", matchId)
        .is("vonage_session_id", null)
        .select("vonage_session_id")
        .single();

      // If update returned nothing, another request beat us — re-fetch the winner
      if (updated?.vonage_session_id) {
        sessionId = updated.vonage_session_id;
      } else {
        const { data: refetched } = await supabase
          .from("matches")
          .select("vonage_session_id")
          .eq("id", matchId)
          .single();
        sessionId = refetched?.vonage_session_id ?? newSessionId;
      }
    } catch (err) {
      console.error("[Vonage] session create error:", err);
      return NextResponse.json({ error: "session create failed" }, { status: 500 });
    }
  }

  if (!sessionId) {
    return NextResponse.json({ error: "session create failed" }, { status: 500 });
  }

  const token = ot.generateToken(sessionId, {
    role: "publisher",
    expireTime: Math.floor(Date.now() / 1000) + 7200,
    data: `matchId=${matchId}`,
  });

  return NextResponse.json({ sessionId, token, apiKey });
}
