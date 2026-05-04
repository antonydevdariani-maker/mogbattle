import { NextRequest, NextResponse } from "next/server";
import { verifyDynamicAccessToken } from "@/lib/dynamic/verify";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("broadcasts")
    .select("id, message, sender_username, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ broadcast: null });
  return NextResponse.json({ broadcast: data });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  let userId: string;
  try {
    userId = await verifyDynamicAccessToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, is_founder")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { message } = await req.json() as { message?: string };
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const { error } = await supabase.from("broadcasts").insert({
    message: message.trim(),
    sender_username: profile.username ?? "Founder",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
