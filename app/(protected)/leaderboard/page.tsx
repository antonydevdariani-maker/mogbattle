"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { loadLeaderboard } from "@/app/actions";
import { ArrowLeft, Crown, Medal, User } from "lucide-react";

type Row = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  elo: number;
  wins: number;
  matches_played: number;
};

export default function LeaderboardPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [rows, setRows] = useState<Row[]>([]);
  const [yourUserId, setYourUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const data = await loadLeaderboard(token);
        setRows(data.rows as Row[]);
        setYourUserId(data.yourUserId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [authenticated, getAccessToken]);

  const yourRank = useMemo(() => {
    if (!yourUserId) return null;
    const i = rows.findIndex((r) => r.user_id === yourUserId);
    return i === -1 ? null : i + 1;
  }, [rows, yourUserId]);

  if (err) {
    return <p className="text-red-400 text-sm">{err}</p>;
  }

  const top = rows[0];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-500/90 mb-1">Rankings</p>
          <h1
            className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Crown className="size-8 text-amber-400 shrink-0" />
            ELO leaderboard
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Highest ELO sits at #1. Tie-break: more wins ranks higher.
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:border-white/30"
        >
          <User className="size-3.5" />
          Profile
        </Link>
      </div>

      {top && (
        <div className="relative overflow-hidden border border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-zinc-950 p-5">
          <div className="absolute -right-6 -top-6 size-24 rounded-full bg-amber-500/20 blur-2xl" aria-hidden />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400/90 mb-2">#1 — Top mogger</p>
          <div className="flex items-center gap-4">
            <div className="size-16 shrink-0 overflow-hidden border-2 border-amber-500/40 bg-zinc-900">
              {top.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={top.avatar_url} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <User className="size-8 text-amber-500/50" />
                </div>
              )}
            </div>
            <p
              className="text-2xl font-black text-white uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {top.username ?? "Anonymous"}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="font-black tabular-nums text-amber-300">{top.elo} ELO</span>
            <span className="text-zinc-500">
              <span className="text-green-400 font-bold">{top.wins}W</span>
              {" · "}
              <span className="text-zinc-400">{top.matches_played - top.wins}L</span>
              {" · "}
              <span className="text-zinc-600">{top.matches_played} played</span>
            </span>
          </div>
        </div>
      )}

      {yourRank !== null && (
        <div className="flex items-center justify-between gap-3 border border-fuchsia-500/30 bg-fuchsia-500/5 px-4 py-3 text-sm">
          <span className="text-zinc-500 uppercase tracking-widest font-bold text-xs">Your rank</span>
          <span className="font-black text-fuchsia-300 tabular-nums">#{yourRank}</span>
        </div>
      )}
      {yourRank === null && rows.length > 0 && yourUserId && (
        <div className="border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-500 text-center">
          You’re not in the top {rows.length} yet. Keep grinding the arena.
        </div>
      )}

      <div className="border border-white/10 bg-zinc-950">
        <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Standings</span>
          <span className="text-[10px] text-zinc-700">{rows.length} moggers</span>
        </div>
        <div className="max-h-[min(60vh,520px)] overflow-y-auto divide-y divide-white/5">
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-zinc-600 uppercase tracking-widest">
              No players yet.
            </p>
          )}
          {rows.map((r, i) => {
            const rank = i + 1;
            const isYou = r.user_id === yourUserId;
            const isTop3 = rank <= 3;
            return (
              <div
                key={r.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  isYou ? "bg-fuchsia-500/10 border-l-2 border-l-fuchsia-500" : "hover:bg-zinc-900/50"
                }`}
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center font-black tabular-nums text-xs ${
                    rank === 1
                      ? "bg-amber-500/20 text-amber-300"
                      : rank === 2
                        ? "bg-zinc-400/15 text-zinc-300"
                        : rank === 3
                          ? "bg-orange-700/20 text-orange-300"
                          : "text-zinc-600"
                  }`}
                >
                  {rank === 1 ? <Crown className="size-4 text-amber-400" /> : rank <= 3 ? <Medal className="size-4" /> : rank}
                </div>
                <div className="size-9 shrink-0 overflow-hidden border border-white/10 bg-zinc-900">
                  {r.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <User className="size-4 text-zinc-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-bold uppercase truncate ${isTop3 ? "text-white" : "text-zinc-300"} ${
                      isYou ? "text-fuchsia-200" : ""
                    }`}
                  >
                    {r.username ?? "Mogger"}
                    {isYou && (
                      <span className="ml-2 text-[10px] font-black text-fuchsia-400/90 normal-case">(you)</span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-600 tabular-nums">
                    {r.wins}W · {r.matches_played - r.wins}L · {r.matches_played} played
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-black tabular-nums ${rank === 1 ? "text-amber-300 text-lg" : "text-white"}`}
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {r.elo}
                  </p>
                  <p className="text-[9px] font-bold uppercase text-zinc-600">ELO</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-3.5" />
        Dashboard
      </Link>
    </div>
  );
}
