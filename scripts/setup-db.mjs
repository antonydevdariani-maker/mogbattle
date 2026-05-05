import { createClient } from "@supabase/supabase-js";

const URL = "https://eqlqlxvyamagplhdneyw.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxbHFseHZ5YW1hZ3BsaGRuZXl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ4OTM4NywiZXhwIjoyMDkzMDY1Mzg3fQ.rkh_cZYk5I4_geR-R-o-Q-AMcBAf760Lxz-KAYBCU2E";

const supabase = createClient(URL, KEY);

async function run() {
  // 1. Delete Ryan_rrv account (matches + profile)
  const { data: ryan } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", "Ryan_rrv")
    .maybeSingle();

  if (ryan) {
    await supabase.from("matches").delete()
      .or(`player1_id.eq.${ryan.user_id},player2_id.eq.${ryan.user_id}`);
    const { error } = await supabase.from("profiles").delete().eq("user_id", ryan.user_id);
    if (error) console.error("delete Ryan_rrv:", error.message);
    else console.log("✓ Ryan_rrv account deleted");
  } else {
    console.log("⚠ Ryan_rrv not found");
  }

  // 2. Set is_founder for vibecodedthis + iloveryan
  const { error: e2 } = await supabase
    .from("profiles")
    .update({ is_founder: true })
    .in("username", ["vibecodedthis", "iloveryan"]);
  if (e2) console.error("founder:", e2.message);
  else console.log("✓ is_founder set for vibecodedthis + iloveryan");

  // 3. Reset iloveryan stats + cancel stuck matches
  const { data: iloveryan } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", "iloveryan")
    .maybeSingle();

  if (iloveryan) {
    const { error: e3 } = await supabase
      .from("profiles")
      .update({ wins: 0, matches_played: 0, elo: 1200, total_credits: 0 })
      .eq("user_id", iloveryan.user_id);
    if (e3) console.error("iloveryan reset:", e3.message);
    else console.log("✓ iloveryan stats reset");

    const { error: e4 } = await supabase
      .from("matches")
      .update({ status: "cancelled" })
      .or(`player1_id.eq.${iloveryan.user_id},player2_id.eq.${iloveryan.user_id}`)
      .in("status", ["waiting", "matched", "live"]);
    if (e4) console.error("iloveryan match cancel:", e4.message);
    else console.log("✓ iloveryan stuck matches cancelled");
  } else {
    console.log("⚠ iloveryan not found");
  }

  // 4. Ensure broadcasts table exists
  const { error: checkErr } = await supabase.from("broadcasts").select("id").limit(1);
  if (checkErr) {
    console.error("\n❌ broadcasts table missing. Run in Supabase SQL Editor:\n");
    console.log(`create table if not exists public.broadcasts (
  id uuid default gen_random_uuid() primary key,
  message text not null,
  sender_username text not null,
  created_at timestamptz default now()
);`);
  } else {
    console.log("✓ broadcasts table ready");
  }
}

run().catch(console.error);
