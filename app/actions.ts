"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { verifySupabaseToken } from "@/lib/supabase/verify";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function requireUser(accessToken: string | null | undefined) {
  const userId = await verifySupabaseToken(accessToken);
  return userId;
}

export async function ensureProfile(
  accessToken: string,
  opts?: { username?: string | null }
) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const displayName = opts?.username ?? "mogger";

  const { data: existing } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();

  if (!existing) {
    await supabase.from("profiles").insert({
      user_id: userId,
      username: displayName,
      total_credits: 0,
      molecules: 500,
    });
  }
}

const USERNAME_MIN = 2;
const USERNAME_MAX = 32;
const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

export async function updateProfileUsername(accessToken: string, rawUsername: string) {
  const userId = await requireUser(accessToken);
  const username = rawUsername.trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    throw new Error(`Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`);
  }
  if (!/^[a-zA-Z0-9_\-\s]+$/.test(username)) {
    throw new Error("Use letters, numbers, spaces, hyphen, or underscore only.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("profiles").update({ username }).eq("user_id", userId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already taken.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
}

export async function uploadProfileAvatar(accessToken: string, formData: FormData) {
  const userId = await requireUser(accessToken);
  const file = formData.get("avatar");
  if (!file || !(file instanceof Blob) || file.size === 0) {
    throw new Error("Choose an image file.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Image must be 10MB or smaller.");
  }
  const mime = (file as File).type || "application/octet-stream";
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
    throw new Error("Use JPG, PNG, WebP, or GIF.");
  }

  const ext =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const supabase = getSupabaseAdmin();
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, buf, {
    contentType: mime,
    upsert: true,
  });
  if (upErr) {
    throw new Error(
      upErr.message.includes("Bucket not found")
        ? "Avatar storage is not configured. Add the Supabase `avatars` bucket (see supabase/storage-avatars.sql)."
        : upErr.message
    );
  }

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_url: pub.publicUrl })
    .eq("user_id", userId);
  if (dbErr) {
    throw new Error(dbErr.message);
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
}

export async function loadProfileSummary(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("total_credits, molecules, last_spin_at, username, avatar_url, is_founder")
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    total_credits: number;
    molecules: number;
    last_spin_at: string | null;
    username: string | null;
    avatar_url: string | null;
    is_founder: boolean | null;
  } | null;
}

export async function loadDashboardData(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const [{ data: profile }, { data: matches }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("matches")
      .select("*")
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(5),
  ]);
  return { profile, matches: matches ?? [], userId };
}

/** Top players by ELO (tie-break: more wins first). */
export type LeaderboardProfileRow = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  elo: number;
  wins: number;
  matches_played: number;
  total_credits: number;
  is_founder: boolean | null;
};

export async function loadLeaderboard(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url, elo, wins, matches_played, total_credits, is_founder")
    .order("elo", { ascending: false })
    .order("wins", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(error.message);
  }
  return {
    rows: (data ?? []) as LeaderboardProfileRow[],
    yourUserId: userId,
  };
}


/** Full profile + more match history for the profile page. */
export async function loadProfilePageData(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const [{ data: profile }, { data: matches }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("matches")
      .select("*")
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(20),
  ]);
  return { profile, matches: matches ?? [], userId };
}


/** Read-only check — returns existing active match without attempting to pair. Used on page load. */
export async function checkArenaState(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: activeMatch } = await supabase
    .from("matches")
    .select("*")
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .in("status", ["waiting", "matched", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Cancel any non-live match on page load — always show lobby first
  if (activeMatch && activeMatch.status !== "live") {
    await supabase.from("matches").update({ status: "cancelled" }).eq("id", activeMatch.id);
    return { activeMatch: null, opponentName: null, userId };
  }

  const opponentId =
    activeMatch?.player1_id === userId ? activeMatch?.player2_id : activeMatch?.player1_id;
  let opponentName: string | null = null;
  if (opponentId) {
    const { data: opp } = await supabase.from("profiles").select("username").eq("user_id", opponentId).maybeSingle();
    opponentName = opp?.username ?? null;
  }
  return { activeMatch: activeMatch ?? null, opponentName, userId };
}

async function cancelStaleMatch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  match: { id: string; player1_id: string; player2_id: string | null; bet_amount: number; is_free_match: boolean; status: string }
) {
  await supabase.from("matches").update({ status: "cancelled" }).eq("id", match.id);

  // Refund both players if bets were deducted (live matches already had bets taken)
  if (match.status === "live" && match.bet_amount > 0 && match.player2_id) {
    const col = match.is_free_match ? "molecules" : "total_credits";
    const { data: profiles } = await supabase
      .from("profiles")
      .select(`user_id, ${col}`)
      .in("user_id", [match.player1_id, match.player2_id]);

    for (const p of profiles ?? []) {
      const current = (p as Record<string, number>)[col] ?? 0;
      await supabase
        .from("profiles")
        .update({ [col]: current + match.bet_amount })
        .eq("user_id", p.user_id);
    }
  }
}

export async function loadBattleQueueState(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: activeMatch } = await supabase
    .from("matches")
    .select("*")
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .in("status", ["waiting", "matched", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Cancel matches stuck in live > 45s or in waiting/matched > 90s
  if (activeMatch) {
    const age = Date.now() - new Date(activeMatch.started_at ?? activeMatch.created_at).getTime();
    const isStale =
      (activeMatch.status === "live" && age > 45_000) ||
      (activeMatch.status !== "live" && age > 90_000);

    if (isStale) {
      await cancelStaleMatch(supabase, activeMatch);
      return { activeMatch: null, opponentName: null, userId };
    }
  }

  // If user is waiting (not yet matched), try to pair with another waiting player.
  // This handles the race condition where both players create "waiting" rows simultaneously.
  if (activeMatch && activeMatch.status === "waiting" && activeMatch.player1_id === userId && !activeMatch.player2_id) {
    const isFree = activeMatch.is_free_match ?? false;
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("elo")
      .eq("user_id", userId)
      .maybeSingle();
    const myElo = myProfile?.elo ?? 1500;

    // Find waiting opponents: same queue type, same bet, not self, ordered by ELO proximity
    const { data: candidates } = await supabase
      .from("matches")
      .select("id, player1_id")
      .eq("status", "waiting")
      .eq("is_free_match", isFree)
      .eq("bet_amount", activeMatch.bet_amount)
      .is("player2_id", null)
      .neq("player1_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    if (candidates && candidates.length > 0) {
      // Pick closest ELO opponent
      const opponentIds = candidates.map((c) => c.player1_id);
      const { data: oppProfiles } = await supabase
        .from("profiles")
        .select("user_id, elo")
        .in("user_id", opponentIds);

      let bestMatchId = candidates[0].id;
      let bestEloDiff = Infinity;
      for (const c of candidates) {
        const prof = oppProfiles?.find((p) => p.user_id === c.player1_id);
        const diff = Math.abs((prof?.elo ?? 1500) - myElo);
        if (diff < bestEloDiff) {
          bestEloDiff = diff;
          bestMatchId = c.id;
        }
      }

      // Join their match row (claim it as player2)
      const deadline = new Date(Date.now() + 10_000).toISOString();
      const { data: merged } = await supabase
        .from("matches")
        .update({ player2_id: userId, status: "matched", negotiation_deadline: deadline })
        .eq("id", bestMatchId)
        .is("player2_id", null) // guard against another player claiming it simultaneously
        .select("*")
        .maybeSingle();

      if (merged) {
        // Cancel our own waiting row since we joined theirs
        await supabase
          .from("matches")
          .update({ status: "cancelled" })
          .eq("id", activeMatch.id);

        const { data: opp } = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", merged.player1_id)
          .maybeSingle();
        revalidatePath("/arena");
        return { activeMatch: merged, opponentName: opp?.username ?? null, userId };
      }
    }
  }

  const opponentId =
    activeMatch?.player1_id === userId ? activeMatch.player2_id : activeMatch?.player1_id;
  let opponentName: string | null = null;
  if (opponentId) {
    const { data: opp } = await supabase.from("profiles").select("username").eq("user_id", opponentId).maybeSingle();
    opponentName = opp?.username ?? null;
  }
  return { activeMatch, opponentName, userId };
}

export async function getMatchForUser(accessToken: string, matchId: string) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) {
    return null;
  }
  return { match, userId };
}

/** Cancel a solo waiting row so the user can leave matchmaking without blocking re-queue. */
export async function cancelWaitingMatch(accessToken: string) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  await supabase
    .from("matches")
    .update({ status: "cancelled" })
    .eq("player1_id", userId)
    .eq("status", "waiting")
    .is("player2_id", null);
  revalidatePath("/battle");
  revalidatePath("/arena");
}

// ─── Daily Spin ──────────────────────────────────────────────────────────────

const SPIN_PRIZES = [50, 75, 100, 125, 150, 200, 250, 500];
const SPIN_WEIGHTS = [30, 25, 20, 10, 7, 5, 2, 1]; // sum = 100

function pickSpinPrize(): number {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < SPIN_PRIZES.length; i++) {
    cumulative += SPIN_WEIGHTS[i];
    if (roll < cumulative) return SPIN_PRIZES[i];
  }
  return SPIN_PRIZES[0];
}

export async function claimDailySpin(accessToken: string) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("profiles")
    .select("molecules, last_spin_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Profile not found.");

  if (profile.last_spin_at) {
    const next = new Date(profile.last_spin_at).getTime() + 24 * 60 * 60 * 1000;
    if (Date.now() < next) {
      throw new Error(`Next spin available in ${Math.ceil((next - Date.now()) / 3600000)}h.`);
    }
  }

  const prize = pickSpinPrize();
  const newMolecules = Number(profile.molecules ?? 0) + prize;
  await supabase
    .from("profiles")
    .update({ molecules: newMolecules, last_spin_at: new Date().toISOString() })
    .eq("user_id", userId);

  revalidatePath("/spin");
  revalidatePath("/dashboard");
  return { prize, newMolecules };
}

export async function loadSpinData(accessToken: string) {
  noStore();
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("molecules, last_spin_at")
    .eq("user_id", userId)
    .maybeSingle();
  const lastSpin = data?.last_spin_at ? new Date(data.last_spin_at).getTime() : null;
  const nextSpinAt = lastSpin ? lastSpin + 24 * 60 * 60 * 1000 : null;
  const canSpin = !nextSpinAt || Date.now() >= nextSpinAt;
  return {
    molecules: Number(data?.molecules ?? 0),
    canSpin,
    nextSpinAt,
    prizes: SPIN_PRIZES,
    weights: SPIN_WEIGHTS,
  };
}

// ─── Molecule (Free) Queue ────────────────────────────────────────────────────

export async function queueForFreeMatch(accessToken: string, betAmount: number) {
  const userId = await requireUser(accessToken);
  const bet = Math.max(1, Math.floor(betAmount));
  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from("profiles")
    .select("molecules")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile || (profile.molecules ?? 0) < bet) {
    throw new Error(`Need at least ${bet} molecules to enter.`);
  }

  const { data: waitingMatch } = await supabase
    .from("matches")
    .select("id,player1_id")
    .eq("status", "waiting")
    .eq("is_free_match", true)
    .eq("bet_amount", bet)
    .is("player2_id", null)
    .neq("player1_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (waitingMatch?.id) {
    const { data: p1Profile } = await supabase
      .from("profiles")
      .select("molecules")
      .eq("user_id", waitingMatch.player1_id)
      .maybeSingle();
    if (!p1Profile || (p1Profile.molecules ?? 0) < bet) {
      await supabase.from("matches").update({ status: "cancelled" }).eq("id", waitingMatch.id);
    } else {
      const { data: matched } = await supabase
        .from("matches")
        .update({
          player2_id: userId,
          status: "live",
          player1_bet_offer: bet,
          player2_bet_offer: bet,
          started_at: new Date().toISOString(),
        })
        .eq("id", waitingMatch.id)
        .is("player2_id", null)
        .select("id")
        .maybeSingle();
      if (matched?.id) {
        await supabase.from("profiles").update({ molecules: (p1Profile.molecules ?? 0) - bet }).eq("user_id", waitingMatch.player1_id);
        await supabase.from("profiles").update({ molecules: (profile.molecules ?? 0) - bet }).eq("user_id", userId);
        revalidatePath("/arena");
        return { matchId: matched.id, state: "found" as const };
      }
    }
  }

  const { data: created } = await supabase
    .from("matches")
    .insert({ player1_id: userId, bet_amount: bet, status: "waiting", is_free_match: true })
    .select("id")
    .single();

  revalidatePath("/arena");
  return { matchId: created?.id, state: "queued" as const };
}

/**
 * Rematch the same opponent in a molecule (free) match.
 * If the opponent already posted a waiting free match, we join it directly.
 * Otherwise we create a waiting match and wait for them to join.
 */
export async function rematchSameOpponent(accessToken: string, originalMatchId: string) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();

  const { data: original } = await supabase
    .from("matches")
    .select("player1_id, player2_id, bet_amount, is_free_match")
    .eq("id", originalMatchId)
    .maybeSingle();

  if (!original?.is_free_match) throw new Error("Rematch only available for molecule battles.");

  const opponentId =
    original.player1_id === userId ? original.player2_id : original.player1_id;
  if (!opponentId) throw new Error("Opponent not found.");

  const bet = original.bet_amount;

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("molecules")
    .eq("user_id", userId)
    .maybeSingle();
  if (!myProfile || (myProfile.molecules ?? 0) < bet) {
    throw new Error(`Need at least ${bet} molecules to rematch.`);
  }

  // Check if the opponent already posted a waiting free rematch.
  const { data: opponentWaiting } = await supabase
    .from("matches")
    .select("id, player1_id")
    .eq("status", "waiting")
    .eq("is_free_match", true)
    .eq("player1_id", opponentId)
    .is("player2_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (opponentWaiting?.id) {
    const { data: oppProfile } = await supabase
      .from("profiles")
      .select("molecules")
      .eq("user_id", opponentId)
      .maybeSingle();

    if (oppProfile && (oppProfile.molecules ?? 0) >= bet) {
      const { data: matched } = await supabase
        .from("matches")
        .update({
          player2_id: userId,
          status: "live",
          player1_bet_offer: bet,
          player2_bet_offer: bet,
          started_at: new Date().toISOString(),
        })
        .eq("id", opponentWaiting.id)
        .is("player2_id", null)
        .select("id, bet_amount")
        .maybeSingle();

      if (matched?.id) {
        const actualBet = matched.bet_amount;
        await supabase
          .from("profiles")
          .update({ molecules: (oppProfile.molecules ?? 0) - actualBet })
          .eq("user_id", opponentId);
        await supabase
          .from("profiles")
          .update({ molecules: (myProfile.molecules ?? 0) - actualBet })
          .eq("user_id", userId);
        revalidatePath("/arena");
        return { matchId: matched.id, state: "found" as const };
      }
    }
  }

  // Opponent hasn't queued yet — create a waiting match for them to join.
  const { data: created } = await supabase
    .from("matches")
    .insert({ player1_id: userId, bet_amount: bet, status: "waiting", is_free_match: true })
    .select("id")
    .single();

  revalidatePath("/arena");
  return { matchId: created?.id, state: "queued" as const };
}

export async function submitMoleculeBetOffer(accessToken: string, matchId: string, amount: number) {
  const userId = await requireUser(accessToken);
  if (!Number.isFinite(amount) || amount < 1) throw new Error("Invalid bet amount.");
  const supabase = getSupabaseAdmin();
  const normalizedAmount = Math.floor(amount);

  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).single();
  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) throw new Error("Not your match.");
  if (match.status !== "matched") throw new Error("Not in negotiation phase.");
  if (!match.is_free_match) throw new Error("Not a free match.");

  if (match.negotiation_deadline && new Date() > new Date(match.negotiation_deadline)) {
    await supabase.from("matches").update({ status: "cancelled" }).eq("id", matchId);
    throw new Error("Negotiation timed out.");
  }

  const isP1 = match.player1_id === userId;
  const updates = isP1 ? { player1_bet_offer: normalizedAmount } : { player2_bet_offer: normalizedAmount };
  const { data: updated } = await supabase.from("matches").update(updates).eq("id", matchId).select("*").single();
  if (!updated) throw new Error("Update failed.");

  const p1Offer = isP1 ? normalizedAmount : (updated.player1_bet_offer ?? null);
  const p2Offer = isP1 ? (updated.player2_bet_offer ?? null) : normalizedAmount;

  if (p1Offer !== null && p2Offer !== null && p1Offer === p2Offer) {
    const { data: players } = await supabase
      .from("profiles")
      .select("user_id,molecules")
      .in("user_id", [match.player1_id, match.player2_id!]);
    const p1 = players?.find((p) => p.user_id === match.player1_id);
    const p2 = players?.find((p) => p.user_id === match.player2_id);
    if (!p1 || !p2 || (p1.molecules ?? 0) < p1Offer || (p2.molecules ?? 0) < p1Offer) {
      throw new Error("Insufficient molecules for agreed bet.");
    }
    await supabase.from("profiles").update({ molecules: (p1.molecules ?? 0) - p1Offer }).eq("user_id", match.player1_id);
    await supabase.from("profiles").update({ molecules: (p2.molecules ?? 0) - p1Offer }).eq("user_id", match.player2_id!);
    await supabase.from("matches").update({ status: "live", bet_amount: p1Offer, started_at: new Date().toISOString() }).eq("id", matchId);
  }

  revalidatePath("/arena");
}

export async function finalizeFreeMatchResult(
  accessToken: string,
  args: { matchId: string; aiScoreP1: number; aiScoreP2: number }
) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: match } = await supabase.from("matches").select("*").eq("id", args.matchId).single();

  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) throw new Error("Invalid match.");
  if (!match.player2_id) throw new Error("Missing opponent.");
  if (match.status === "completed") return;
  if (!match.is_free_match) throw new Error("Not a free match.");

  const isTie = Math.abs(args.aiScoreP1 - args.aiScoreP2) < 0.1;
  const winnerId = isTie ? null : (args.aiScoreP1 > args.aiScoreP2 ? match.player1_id : match.player2_id);
  const loserId = isTie ? null : (winnerId === match.player1_id ? match.player2_id : match.player1_id);

  await supabase.from("matches").update({
    status: "completed",
    winner_id: winnerId,
    ai_score_p1: Number(args.aiScoreP1.toFixed(2)),
    ai_score_p2: Number(args.aiScoreP2.toFixed(2)),
    ended_at: new Date().toISOString(),
  }).eq("id", match.id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id,elo,wins,matches_played,molecules")
    .in("user_id", [match.player1_id, match.player2_id]);
  const p1Profile = profiles?.find((p) => p.user_id === match.player1_id);
  const p2Profile = profiles?.find((p) => p.user_id === match.player2_id);
  if (!p1Profile || !p2Profile) return;

  // Molecule game: +10 ELO for win, -5 ELO for loss
  const ELO_WIN = 10;
  const ELO_LOSS = 5;

  if (isTie) {
    // Tie: refund both players their bet, no ELO change
    await supabase.from("profiles").update({
      molecules: (p1Profile.molecules ?? 0) + match.bet_amount,
      matches_played: p1Profile.matches_played + 1,
    }).eq("user_id", match.player1_id);
    await supabase.from("profiles").update({
      molecules: (p2Profile.molecules ?? 0) + match.bet_amount,
      matches_played: p2Profile.matches_played + 1,
    }).eq("user_id", match.player2_id);
  } else {
    const winner = profiles?.find((p) => p.user_id === winnerId!);
    const loser = profiles?.find((p) => p.user_id === loserId!);
    if (!winner || !loser) return;
    const winnerElo = (winner.elo ?? 1500) + ELO_WIN;
    const loserElo = Math.max(0, (loser.elo ?? 1500) - ELO_LOSS);
    await supabase.from("profiles").update({
      molecules: (winner.molecules ?? 0) + match.bet_amount * 2,
      wins: winner.wins + 1,
      matches_played: winner.matches_played + 1,
      elo: winnerElo,
    }).eq("user_id", winnerId!);
    await supabase.from("profiles").update({
      matches_played: loser.matches_played + 1,
      elo: loserElo,
    }).eq("user_id", loserId!);
  }

  revalidatePath("/dashboard");
  revalidatePath("/arena");
}


export async function getPlayerCount(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function forfeitMatch(accessToken: string, matchId: string) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();

  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).single();
  if (!match) throw new Error("Match not found.");
  if (match.status === "completed") return;
  if (match.player1_id !== userId && match.player2_id !== userId) throw new Error("Not your match.");

  const winnerId = match.player1_id === userId ? match.player2_id : match.player1_id;
  const loserId = userId;
  if (!winnerId) return;

  await supabase.from("matches").update({
    status: "completed",
    winner_id: winnerId,
    ended_at: new Date().toISOString(),
    ai_score_p1: match.player1_id === loserId ? 0 : 10,
    ai_score_p2: match.player2_id === loserId ? 0 : 10,
  }).eq("id", matchId);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id,elo,wins,matches_played,molecules")
    .in("user_id", [winnerId, loserId]);

  const winner = profiles?.find((p) => p.user_id === winnerId);
  const loser = profiles?.find((p) => p.user_id === loserId);
  if (!winner || !loser) return;

  await supabase.from("profiles").update({
    molecules: (winner.molecules ?? 0) + match.bet_amount * 2,
    wins: winner.wins + 1,
    matches_played: winner.matches_played + 1,
  }).eq("user_id", winnerId);
  await supabase.from("profiles").update({
    matches_played: loser.matches_played + 1,
  }).eq("user_id", loserId);

  revalidatePath("/dashboard");
  revalidatePath(`/match/${matchId}`);
}

/** Each player writes only their own PSL column (`ai_score_p1` or `ai_score_p2`) while status is live. */
export async function submitMyPslScore(
  accessToken: string,
  args: { matchId: string; psl: number }
) {
  const userId = await requireUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: match } = await supabase
    .from("matches")
    .select("player1_id, player2_id, status")
    .eq("id", args.matchId)
    .maybeSingle();
  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) {
    throw new Error("Invalid match.");
  }
  if (match.status !== "live") return;
  const col = match.player1_id === userId ? "ai_score_p1" : "ai_score_p2";
  await supabase
    .from("matches")
    .update({ [col]: Number(args.psl.toFixed(2)) })
    .eq("id", args.matchId);
}
