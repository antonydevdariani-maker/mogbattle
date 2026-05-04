import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_KEY = process.env.VONAGE_API_KEY!;
const API_SECRET = process.env.VONAGE_API_SECRET!;

/** Create a Vonage Video session via REST (no SDK — avoids bundler issues). */
async function createVonageSession(): Promise<string> {
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");
  const res = await fetch("https://api.opentok.com/session/create", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "p2p.preference=disabled",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vonage session create failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as Array<{ session_id: string }>;
  return data[0].session_id;
}

/**
 * Generate a Vonage Video publisher token manually.
 * Format: T1==base64(partner_id=<key>&sig=<hmac>:<dataString>)
 */
function generateToken(
  sessionId: string,
  role = "publisher",
  expireSeconds = 7200
): string {
  const now = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 999999);

  const parts = [
    `role=${role}`,
    `session_id=${sessionId}`,
    `create_time=${now}`,
    `expire_time=${now + expireSeconds}`,
    `nonce=${nonce}`,
  ];
  const dataString = parts.join("&");

  const sig = crypto
    .createHmac("sha1", API_SECRET)
    .update(dataString)
    .digest("hex");

  const tokenData = `partner_id=${API_KEY}&sig=${sig}:${dataString}`;
  return `T1==${Buffer.from(tokenData).toString("base64")}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  if (!API_KEY || !API_SECRET) {
    console.error("[Vonage] VONAGE_API_KEY or VONAGE_API_SECRET is not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  const { data: match } = await supabase
    .from("matches")
    .select("vonage_session_id")
    .eq("id", matchId)
    .single();

  if (!match) {
    return NextResponse.json({ error: "match not found" }, { status: 404 });
  }

  let sessionId = match.vonage_session_id as string | null;

  if (!sessionId) {
    try {
      const newSessionId = await createVonageSession();

      // Only write if still null — prevents race between both players
      const { data: updated } = await supabase
        .from("matches")
        .update({ vonage_session_id: newSessionId })
        .eq("id", matchId)
        .is("vonage_session_id", null)
        .select("vonage_session_id")
        .single();

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
    return NextResponse.json({ error: "no session id" }, { status: 500 });
  }

  const token = generateToken(sessionId);
  return NextResponse.json({ sessionId, token, apiKey: API_KEY });
}
