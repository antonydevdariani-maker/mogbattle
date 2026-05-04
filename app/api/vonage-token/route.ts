import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";
import { SignJWT, importPKCS8 } from "jose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_ID = process.env.VONAGE_APP_ID!;
// Vercel stores with real newlines; .env.local stores with literal \n — handle both
const PRIVATE_KEY = (process.env.VONAGE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

/** Build a short-lived JWT for authenticating against the Vonage Video REST API. */
async function buildJwt(): Promise<string> {
  const privateKey = await importPKCS8(PRIVATE_KEY, "RS256");
  return new SignJWT({ ist: "project" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(APP_ID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

/** Create a Vonage Video session via REST with JWT bearer auth. */
async function createVonageSession(): Promise<string> {
  const jwt = await buildJwt();
  const res = await fetch("https://video.api.vonage.com/session/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
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
 * Generate a Vonage Video publisher token (T1== format).
 * sig = HMAC-SHA1(dataString, APP_ID) — Vonage uses App ID as the HMAC key
 * when authenticating with App ID + Private Key.
 */
function generateToken(sessionId: string, role = "publisher", expireSeconds = 7200): string {
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
    .createHmac("sha1", APP_ID)
    .update(dataString)
    .digest("hex");

  const tokenData = `partner_id=${APP_ID}&sig=${sig}:${dataString}`;
  return `T1==${Buffer.from(tokenData).toString("base64")}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  }

  if (!APP_ID || !PRIVATE_KEY) {
    console.error("[Vonage] VONAGE_APP_ID or VONAGE_PRIVATE_KEY is not set");
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
  return NextResponse.json({ sessionId, token, apiKey: APP_ID });
}
