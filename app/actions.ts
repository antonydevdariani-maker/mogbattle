"use server";

import { revalidatePath } from "next/cache";
import { verifyPrivyAccessToken } from "@/lib/privy/verify";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyUsdcPlatformFeeTransaction } from "@/lib/solana/verify-fee-tx";
import { mogCreditsFromGrossUsdc } from "@/lib/wallet/usdc-deposit";

const MIN_DEPOSIT = 1;

async function requirePrivyUser(accessToken: string | null | undefined) {
  const userId = await verifyPrivyAccessToken(accessToken);
  return userId;
}

export async function ensureProfile(
  accessToken: string,
  opts?: { walletAddress?: string | null; username?: string | null }
) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const displayName =
    opts?.username ??
    (opts?.walletAddress
      ? `${opts.walletAddress.slice(0, 4)}…${opts.walletAddress.slice(-4)}`
      : "mogger");

  const { data: existing } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();

  if (!existing) {
    await supabase.from("profiles").insert({
      user_id: userId,
      username: displayName,
      wallet_address: opts?.walletAddress ?? null,
      total_credits: 500,
    });
  } else {
    const patch: Record<string, string | null> = {};
    if (opts?.walletAddress) patch.wallet_address = opts.walletAddress;
    // Never overwrite `username` here — users set it in /profile. (Derived Privy labels are insert-only.)
    if (Object.keys(patch).length) {
      await supabase.from("profiles").update(patch).eq("user_id", userId);
    }
  }
}

const USERNAME_MIN = 2;
const USERNAME_MAX = 32;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export async function updateProfileUsername(accessToken: string, rawUsername: string) {
  const userId = await requirePrivyUser(accessToken);
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
  const userId = await requirePrivyUser(accessToken);
  const file = formData.get("avatar");
  if (!file || !(file instanceof Blob) || file.size === 0) {
    throw new Error("Choose an image file.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Image must be 2MB or smaller.");
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
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("total_credits, username, wallet_address")
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    total_credits: number;
    username: string | null;
    wallet_address: string | null;
  } | null;
}

export async function loadDashboardData(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
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
};

export async function loadLeaderboard(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url, elo, wins, matches_played, total_credits")
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

/** Richest moggers by Mog Credits balance. */
export async function loadCreditsLeaderboard(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url, elo, wins, matches_played, total_credits")
    .order("total_credits", { ascending: false })
    .order("elo", { ascending: false })
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
  const userId = await requirePrivyUser(accessToken);
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

export async function loadWalletData(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const [{ data: profile }, { data: txs }] = await Promise.all([
    supabase.from("profiles").select("total_credits").eq("user_id", userId).maybeSingle(),
    supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    balance: Number(profile?.total_credits ?? 0),
    transactions: txs ?? [],
    userId,
  };
}

export async function loadBattleQueueState(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: activeMatch } = await supabase
    .from("matches")
    .select("*")
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .in("status", ["waiting", "matched", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) {
    return null;
  }
  return { match, userId };
}

export async function depositCredits(accessToken: string, formData: FormData) {
  const userId = await requirePrivyUser(accessToken);
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
    throw new Error("Enter a valid deposit amount.");
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from("profiles").select("total_credits").eq("user_id", userId).maybeSingle();

  const nextBalance = Number(profile?.total_credits ?? 0) + Math.floor(amount);

  await supabase.from("profiles").update({ total_credits: nextBalance }).eq("user_id", userId);
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "deposit",
    amount: Math.floor(amount),
    status: "completed",
    tx_signature: `dep_${crypto.randomUUID().slice(0, 12)}`,
  });

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
}

const MIN_USDC_GROSS = 0.01;

/** After on-chain 20% USDC fee to platform wallet, credit 80% as Mog Credits. */
export async function recordUsdcDepositClaim(
  accessToken: string,
  input: { grossUsdc: number; txSignature: string }
) {
  const userId = await requirePrivyUser(accessToken);
  const grossUsdc = input.grossUsdc;
  const txSignature = input.txSignature?.trim() ?? "";
  if (!txSignature) {
    throw new Error("Missing transaction signature.");
  }
  if (!Number.isFinite(grossUsdc) || grossUsdc < MIN_USDC_GROSS) {
    throw new Error("Enter a valid USDC amount (e.g. at least 0.01).");
  }

  const credits = mogCreditsFromGrossUsdc(grossUsdc);
  if (credits < 1) {
    throw new Error("Net credits would be zero. Use a larger USDC amount.");
  }

  const supabase = getSupabaseAdmin();
  const { data: dup } = await supabase.from("transactions").select("id").eq("tx_signature", txSignature).maybeSingle();
  if (dup) {
    throw new Error("This transaction was already claimed.");
  }

  const v = await verifyUsdcPlatformFeeTransaction({ signature: txSignature, grossUsdc });
  if (!v.ok) {
    throw new Error(v.reason);
  }

  const { data: profile } = await supabase.from("profiles").select("total_credits").eq("user_id", userId).maybeSingle();
  const next = Number(profile?.total_credits ?? 0) + credits;

  await supabase.from("profiles").update({ total_credits: next }).eq("user_id", userId);
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "deposit",
    amount: credits,
    status: "completed",
    tx_signature: txSignature,
  });

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
}

export async function buildWithdrawTransaction(
  accessToken: string,
  input: { ownerAddress: string; destinationAddress: string; amountMc: number }
): Promise<{ transactionBase64: string }> {
  const userId = await requirePrivyUser(accessToken);
  const { ownerAddress, destinationAddress, amountMc } = input;
  if (!Number.isFinite(amountMc) || amountMc < 2 || !Number.isInteger(amountMc)) {
    throw new Error("Enter a valid whole number of Mog Credits (minimum 2).");
  }

  try {
    const { PublicKey } = await import("@solana/web3.js");
    const o = new PublicKey(ownerAddress.trim());
    const d = new PublicKey(destinationAddress.trim());
    if (o.equals(d)) {
      throw new Error("Destination must be a different wallet.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Destination")) throw e;
    throw new Error("Enter a valid Solana address for your personal wallet.");
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from("profiles").select("total_credits").eq("user_id", userId).maybeSingle();

  const current = Number(profile?.total_credits ?? 0);
  if (current < amountMc) {
    throw new Error("Insufficient Mog Credits for this withdrawal.");
  }

  const { buildUsdcWithdrawTransferTxBytes } = await import("@/lib/solana/build-usdc-withdraw-tx");
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const owner = new PublicKey(ownerAddress.trim());
  const recipient = new PublicKey(destinationAddress.trim());
  const { transactionBytes } = await buildUsdcWithdrawTransferTxBytes({
    owner,
    recipient,
    amountMc,
    connection,
  });
  return { transactionBase64: Buffer.from(transactionBytes).toString("base64") };
}

/** After user signs SPL USDC send to their personal wallet, verify chain and deduct Mog Credits. */
export async function recordWithdrawalClaim(
  accessToken: string,
  input: { signature: string; ownerAddress: string; destinationAddress: string; amountMc: number }
) {
  const userId = await requirePrivyUser(accessToken);
  const signature = input.signature?.trim() ?? "";
  const ownerAddress = input.ownerAddress?.trim() ?? "";
  const destinationAddress = input.destinationAddress?.trim() ?? "";
  const amountMc = input.amountMc;

  if (!signature) {
    throw new Error("Missing transaction signature.");
  }
  if (!Number.isFinite(amountMc) || amountMc < 2 || !Number.isInteger(amountMc)) {
    throw new Error("Invalid withdrawal amount (minimum 2 MC).");
  }

  const supabase = getSupabaseAdmin();
  const { data: dup } = await supabase.from("transactions").select("id").eq("tx_signature", signature).maybeSingle();
  if (dup) {
    throw new Error("This transaction was already recorded.");
  }

  const { verifyUsdcWithdrawTransaction } = await import("@/lib/solana/verify-withdraw-tx");
  const v = await verifyUsdcWithdrawTransaction({
    signature,
    ownerAddress,
    recipientAddress: destinationAddress,
    amountMc,
  });
  if (!v.ok) {
    throw new Error(v.reason);
  }

  const { data: profile } = await supabase.from("profiles").select("total_credits").eq("user_id", userId).maybeSingle();
  const current = Number(profile?.total_credits ?? 0);
  if (current < amountMc) {
    throw new Error("Insufficient Mog Credits.");
  }

  await supabase
    .from("profiles")
    .update({ total_credits: current - amountMc, wallet_address: ownerAddress })
    .eq("user_id", userId);
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "withdraw",
    amount: amountMc,
    status: "completed",
    tx_signature: signature,
  });

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
}

export async function queueForBattle(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();

  // Require min 1 MOG credit to enter
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile || profile.total_credits < 1) {
    throw new Error("Need at least 1 MOG coin to enter.");
  }

  // Check for any waiting match (not own)
  const { data: waitingMatch } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "waiting")
    .is("player2_id", null)
    .neq("player1_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (waitingMatch?.id) {
    const deadline = new Date(Date.now() + 10_000).toISOString();
    const { data: matched } = await supabase
      .from("matches")
      .update({
        player2_id: userId,
        status: "matched",
        negotiation_deadline: deadline,
      })
      .eq("id", waitingMatch.id)
      .select("id")
      .single();
    revalidatePath("/battle");
    revalidatePath("/arena");
    return { matchId: matched?.id, state: "found" as const };
  }

  const { data: created } = await supabase
    .from("matches")
    .insert({
      player1_id: userId,
      bet_amount: 0,
      status: "waiting",
    })
    .select("id")
    .single();

  revalidatePath("/battle");
  revalidatePath("/arena");
  return { matchId: created?.id, state: "queued" as const };
}

/** Cancel a solo waiting row so the user can leave matchmaking without blocking re-queue. */
export async function cancelWaitingMatch(accessToken: string) {
  const userId = await requirePrivyUser(accessToken);
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

export async function submitBetOffer(accessToken: string, matchId: string, amount: number) {
  const userId = await requirePrivyUser(accessToken);
  if (!Number.isFinite(amount) || amount < 1) throw new Error("Invalid bet amount.");

  const supabase = getSupabaseAdmin();
  const normalizedAmount = Math.floor(amount);

  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).single();
  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) {
    throw new Error("Not your match.");
  }
  if (match.status !== "matched") throw new Error("Not in negotiation phase.");

  // Check deadline
  if (match.negotiation_deadline && new Date() > new Date(match.negotiation_deadline)) {
    await supabase.from("matches").update({ status: "cancelled" }).eq("id", matchId);
    throw new Error("Negotiation timed out.");
  }

  const isP1 = match.player1_id === userId;
  const updates = isP1
    ? { player1_bet_offer: normalizedAmount }
    : { player2_bet_offer: normalizedAmount };

  const { data: updated } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", matchId)
    .select("*")
    .single();

  if (!updated) throw new Error("Update failed.");

  // Check if both offers match
  const p1Offer = isP1 ? normalizedAmount : (updated.player1_bet_offer ?? null);
  const p2Offer = isP1 ? (updated.player2_bet_offer ?? null) : normalizedAmount;

  if (p1Offer !== null && p2Offer !== null && p1Offer === p2Offer) {
    // Verify both have enough balance
    const { data: players } = await supabase
      .from("profiles")
      .select("user_id,total_credits")
      .in("user_id", [match.player1_id, match.player2_id!]);
    const p1 = players?.find((p) => p.user_id === match.player1_id);
    const p2 = players?.find((p) => p.user_id === match.player2_id);

    if (!p1 || !p2 || p1.total_credits < p1Offer || p2.total_credits < p1Offer) {
      throw new Error("Insufficient balance for agreed bet.");
    }

    // Deduct and go live
    await supabase
      .from("profiles")
      .update({ total_credits: p1.total_credits - p1Offer })
      .eq("user_id", match.player1_id);
    await supabase
      .from("profiles")
      .update({ total_credits: p2.total_credits - p1Offer })
      .eq("user_id", match.player2_id!);
    await supabase
      .from("matches")
      .update({
        status: "live",
        bet_amount: p1Offer,
        started_at: new Date().toISOString(),
      })
      .eq("id", matchId);
  }

  revalidatePath("/battle");
  revalidatePath(`/match/${matchId}`);
}

export async function confirmBattleMatch(accessToken: string, matchId: string) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).single();

  if (!match) {
    throw new Error("Match not found.");
  }
  if (match.player1_id !== userId && match.player2_id !== userId) {
    throw new Error("Not your match.");
  }
  if (!match.player2_id) {
    throw new Error("Waiting for opponent.");
  }

  const updates =
    match.player1_id === userId ? { player1_confirmed: true } : { player2_confirmed: true };

  const { data: confirmed } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", matchId)
    .select("*")
    .single();

  if (!confirmed) {
    throw new Error("Failed to confirm match.");
  }

  if (confirmed.player1_confirmed && confirmed.player2_confirmed && confirmed.status !== "live") {
    const { data: players } = await supabase
      .from("profiles")
      .select("user_id,total_credits")
      .in("user_id", [confirmed.player1_id, confirmed.player2_id]);
    const p1 = players?.find((p) => p.user_id === confirmed.player1_id);
    const p2 = players?.find((p) => p.user_id === confirmed.player2_id);

    if (!p1 || !p2 || p1.total_credits < confirmed.bet_amount || p2.total_credits < confirmed.bet_amount) {
      throw new Error("One player has insufficient balance.");
    }

    await supabase
      .from("profiles")
      .update({ total_credits: p1.total_credits - confirmed.bet_amount })
      .eq("user_id", confirmed.player1_id);
    await supabase
      .from("profiles")
      .update({ total_credits: p2.total_credits - confirmed.bet_amount })
      .eq("user_id", confirmed.player2_id);
    await supabase
      .from("matches")
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("id", confirmed.id);
  }

  revalidatePath("/battle");
  revalidatePath(`/match/${matchId}`);
}

function expectedScore(player: number, opponent: number) {
  return 1 / (1 + 10 ** ((opponent - player) / 400));
}

export async function finalizeMatchResult(
  accessToken: string,
  args: { matchId: string; aiScoreP1: number; aiScoreP2: number }
) {
  const userId = await requirePrivyUser(accessToken);
  const supabase = getSupabaseAdmin();
  const { data: match } = await supabase.from("matches").select("*").eq("id", args.matchId).single();

  if (!match || (match.player1_id !== userId && match.player2_id !== userId)) {
    throw new Error("Invalid match.");
  }

  if (!match.player2_id) {
    throw new Error("Missing opponent.");
  }

  if (match.status === "completed") {
    return;
  }

  const winnerId = args.aiScoreP1 >= args.aiScoreP2 ? match.player1_id : match.player2_id;
  const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
  const winnings = match.bet_amount * 2;

  await supabase
    .from("matches")
    .update({
      status: "completed",
      winner_id: winnerId,
      ai_score_p1: Number(args.aiScoreP1.toFixed(2)),
      ai_score_p2: Number(args.aiScoreP2.toFixed(2)),
      ended_at: new Date().toISOString(),
    })
    .eq("id", match.id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id,elo,wins,matches_played,total_credits")
    .in("user_id", [winnerId, loserId]);
  const winner = profiles?.find((p) => p.user_id === winnerId);
  const loser = profiles?.find((p) => p.user_id === loserId);
  if (!winner || !loser) {
    return;
  }

  const k = 24;
  const winnerExpected = expectedScore(winner.elo, loser.elo);
  const loserExpected = expectedScore(loser.elo, winner.elo);
  const winnerElo = Math.round(winner.elo + k * (1 - winnerExpected));
  const loserElo = Math.round(loser.elo + k * (0 - loserExpected));

  await supabase
    .from("profiles")
    .update({
      total_credits: winner.total_credits + winnings,
      wins: winner.wins + 1,
      matches_played: winner.matches_played + 1,
      elo: winnerElo,
    })
    .eq("user_id", winnerId);
  await supabase
    .from("profiles")
    .update({
      matches_played: loser.matches_played + 1,
      elo: loserElo,
    })
    .eq("user_id", loserId);

  revalidatePath("/dashboard");
  revalidatePath("/battle");
  revalidatePath(`/match/${args.matchId}`);
}


export async function buildDepositTransaction(
  accessToken: string,
  { grossUsdc, ownerAddress }: { grossUsdc: number; ownerAddress: string }
): Promise<{ transactionBase64: string; expectedFeeRaw: string }> {
  await requirePrivyUser(accessToken);
  const { buildUsdcFeeTransferTxBytes } = await import("@/lib/solana/build-usdc-fee-tx");
  const { PublicKey, Connection } = await import("@solana/web3.js");
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const owner = new PublicKey(ownerAddress);
  const { transactionBytes, expectedFeeRaw } = await buildUsdcFeeTransferTxBytes({ owner, grossUsdc, connection });
  return {
    transactionBase64: Buffer.from(transactionBytes).toString("base64"),
    expectedFeeRaw: expectedFeeRaw.toString(),
  };
}
