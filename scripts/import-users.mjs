/**
 * import-users.mjs
 *
 * Imports Dynamic user export CSV into Supabase Auth.
 * For each unique email:
 *   1. Creates a Supabase auth user (email confirmed, random password)
 *   2. If an existing profile with the old Dynamic user_id exists, updates it
 *      to the new Supabase UUID so ELO/molecules/username are preserved.
 *
 * Usage:
 *   node scripts/import-users.mjs /path/to/export.csv
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { randomBytes } from "crypto";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const CSV_PATH = process.argv[2];
if (!CSV_PATH) {
  console.error("Usage: node scripts/import-users.mjs /path/to/export.csv");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Parse CSV ────────────────────────────────────────────────────────────────

async function parseUsers(csvPath) {
  const users = new Map(); // dynamic_user_id → { email, username }

  const rl = createInterface({
    input: createReadStream(csvPath, "utf-8"),
    crlfDelay: Infinity,
  });

  let headers = null;
  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line);
      continue;
    }
    const cols = parseCSVLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));

    const uid = row["user_id"]?.trim();
    const email = row["user_email"]?.trim();
    const username = (row["user_username"] || row["user_alias"] || "").trim();

    if (uid && email && !users.has(uid)) {
      users.set(uid, { email, username });
    }
  }

  return users;
}

/** Very simple CSV line parser — handles quoted fields with commas. */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Parsing CSV…");
  const users = await parseUsers(CSV_PATH);
  console.log(`Found ${users.size} unique users with emails.\n`);

  let created = 0;
  let skipped = 0;
  let profilesMigrated = 0;
  let errors = 0;

  const entries = [...users.entries()];

  for (let i = 0; i < entries.length; i++) {
    const [dynamicUserId, { email, username }] = entries[i];

    if (i % 100 === 0) {
      console.log(`[${i}/${entries.length}] created=${created} skipped=${skipped} migrated=${profilesMigrated} errors=${errors}`);
    }

    // 1. Create Supabase auth user
    const tempPassword = randomBytes(16).toString("hex");
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // mark email as already confirmed
    });

    if (authError) {
      if (authError.message?.includes("already registered") || authError.code === "email_exists") {
        skipped++;
      } else {
        console.error(`  Error creating ${email}: ${authError.message}`);
        errors++;
      }
      continue;
    }

    const newUserId = authData.user.id;
    created++;

    // 2. Check if they have an existing profile (keyed by Dynamic user_id)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id, username, elo, molecules, wins, matches_played")
      .eq("user_id", dynamicUserId)
      .maybeSingle();

    if (existingProfile) {
      // Migrate: update the profile's user_id to the new Supabase UUID
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ user_id: newUserId })
        .eq("user_id", dynamicUserId);

      if (updateErr) {
        // If conflict (new UUID already has a profile), just delete the old one
        await supabase.from("profiles").delete().eq("user_id", dynamicUserId);
      } else {
        profilesMigrated++;
      }
    } else {
      // No existing profile — insert a fresh one (they'll get 500 molecules on first login via ensureProfile, but insert now so username from export is used)
      const derivedUsername = username || email.split("@")[0];
      await supabase.from("profiles").upsert({
        user_id: newUserId,
        username: derivedUsername,
        molecules: 500,
        total_credits: 0,
      }, { onConflict: "user_id" });
    }

    // Small delay to avoid hitting rate limits
    if (i % 10 === 0 && i > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log("\n=== Import complete ===");
  console.log(`  Created:          ${created}`);
  console.log(`  Skipped (exists): ${skipped}`);
  console.log(`  Profiles migrated: ${profilesMigrated}`);
  console.log(`  Errors:           ${errors}`);
  console.log("\nUsers must use 'Forgot password?' on /login to set their password.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
