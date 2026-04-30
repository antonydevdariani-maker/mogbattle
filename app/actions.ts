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
    if (opts?.username) patch.username = opts.username;
    if (Object.keys(patch).length) {
      await supabase.from("profiles").update(patch).eq("user_id", userId);
    }
  }
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
    .in("status", ["waiting", "live"])
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

export async function cashOutCredits(accessToken: string, formData: FormData) {
  const userId = await requirePrivyUser(accessToken);
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
    throw new Error("Enter a valid cash out amount.");
  }

  const normalized = Math.floor(amount);
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from("profiles").select("total_credits").eq("user_id", userId).maybeSingle();

  const current = Number(profile?.total_credits ?? 0);
  if (current < normalized) {
    throw new Error("Insufficient Mog Credits.");
  }

  await supabase.from("profiles").update({ total_credits: current - normalized }).eq("user_id", userId);
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "withdraw",
    amount: normalized,
    status: "completed",
    tx_signature: `wdr_${crypto.randomUUID().slice(0, 12)}`,
  });

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
}

export async function queueForBattle(accessToken: string, betAmount: number) {
  const userId = await requirePrivyUser(accessToken);
  if (!Number.isFinite(betAmount) || betAmount < 1) {
    throw new Error("Invalid bet amount.");
  }

  const supabase = getSupabaseAdmin();
  const normalizedBet = Math.floor(betAmount);

  const { data: waitingMatch } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "waiting")
    .is("player2_id", null)
    .neq("player1_id", userId)
    .eq("bet_amount", normalizedBet)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (waitingMatch?.id) {
    const { data: matched } = await supabase
      .from("matches")
      .update({ player2_id: userId })
      .eq("id", waitingMatch.id)
      .select("id")
      .single();
    revalidatePath("/battle");
    return { matchId: matched?.id, state: "found" as const };
  }

  const { data: created } = await supabase
    .from("matches")
    .insert({
      player1_id: userId,
      bet_amount: normalizedBet,
      status: "waiting",
    })
    .select("id")
    .single();

  revalidatePath("/battle");
  return { matchId: created?.id, state: "queued" as const };
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

