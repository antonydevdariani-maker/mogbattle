"use client";

import Link from "next/link";
import { getAuthToken, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useEffect, useMemo, useState } from "react";
import { loadCreditsLeaderboard, loadLeaderboard, type LeaderboardProfileRow } from "@/app/actions";
import {
  ELO_GRAPH_MAX,
  ELO_TIER_BANDS,
  eloToPercentOnGraph,
  segmentWidthPercent,
  tierForElo,
} from "@/lib/leaderboard/elo-tiers";
import { ArrowLeft, Crown, Medal, User, Zap } from "lucide-react";

type Board = "elo" | "credits";

export default function LeaderboardPage() {
  const { user } = useDynamicContext();
  const authToken = getAuthToken();
  const isAuthenticated = useIsLoggedIn();
  const [board, setBoard] = useState<Board>("elo");
  const [rows, setRows] = useState<LeaderboardProfileRow[]>([]);
  const [yourUserId, setYourUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const data =
          board === "elo" ? await loadLeaderboard(authToken) : await loadCreditsLeaderboard(authToken);
        if (cancelled) return;
        setRows(data.rows);
        setYourUserId(data.yourUserId);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authToken, board]);

  const yourRank = useMemo(() => {
    if (!yourUserId) return null;
    const i = rows.findIndex((r) => r.user_id === yourUserId);
    return i === -1 ? null : i + 1;
  }, [rows, yourUserId]);

  const yourElo = useMemo(() => {
    if (!yourUserId || board !== "elo") return null;
    return rows.find((r) => r.user_id === yourUserId)?.elo ?? null;
  }, [rows, yourUserId, board]);

  const yourCredits = useMemo(() => {
    if (!yourUserId || board !== "credits") return null;
    const v = rows.find((r) => r.user_id === yourUserId)?.total_credits;
    return v != null ? Number(v) : null;
  }, [rows, yourUserId, board]);

  if (err) {
    return <p className="text-red-400 text-sm">{err}</p>;
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-500/90 mb-1">Rankings</p>
          <h1
            className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight flex flex-wrap items-center gap-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Crown className="size-7 sm:size-8 text-amber-400 shrink-0" />
            {board === "elo" ? "ELO leaderboard" : "Mog points leaderboard"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {board === "elo"
              ? "Highest ELO is #1. Tie-break: more wins."
              : "Most Mog Credits (MC) in the bank. Tie-break: higher ELO."}
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:border-white/30 shrink-0"
        >
          <User className="size-3.5" />
          Profile
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBoard("elo")}
          className={`border px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
            board === "elo"
              ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
              : "border-white/10 bg-zinc-950 text-zinc-500 hover:border-white/25 hover:text-zinc-300"
          }`}
        >
          ELO leaderboard
        </button>
        <button
          type="button"
          onClick={() => setBoard("credits")}
          className={`inline-flex items-center gap-2 border px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
            board === "credits"
              ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200"
              : "border-white/10 bg-zinc-950 text-zinc-500 hover:border-white/25 hover:text-zinc-300"
          }`}
        >
          <Zap className="size-3.5 text-fuchsia-400" />
          Mog points leaderboard
        </button>
      </div>

      {board === "elo" && <EloTierGraph yourElo={yourElo} />}

      {board === "credits" && yourCredits !== null && (
        <div className="border border-fuchsia-500/25 bg-fuchsia-500/5 px-4 py-2 text-center text-[10px] font-bold text-fuchsia-200/90">
          Your balance:{" "}
          <span className="tabular-nums text-white">{yourCredits.toLocaleString()}</span> MC
        </div>
      )}

      <TopThreePodium rows={rows} board={board} />

      {yourRank !== null && (
        <div className="flex items-center justify-between gap-3 border border-fuchsia-500/30 bg-fuchsia-500/5 px-4 py-3 text-sm">
          <span className="text-zinc-500 uppercase tracking-widest font-bold text-xs">Your rank</span>
          <span className="font-black text-fuchsia-300 tabular-nums">#{yourRank}</span>
        </div>
      )}
      {yourRank === null && rows.length > 0 && yourUserId && (
        <div className="border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-500 text-center">
          You’re not in the top {rows.length} yet. Keep grinding.
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
            const mc = Number(r.total_credits);
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
                    {r.is_founder && (
                      <span className="ml-2 inline-flex items-center gap-0.5 border border-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300 normal-case">
                        <Zap className="size-2.5" />
                        Founder
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-600 tabular-nums">
                    {r.wins}W · {r.matches_played - r.wins}L · {r.matches_played} played
                    {board === "credits" && (
                      <span className="text-zinc-700"> · {r.elo} elo</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {board === "elo" ? (
                    <>
                      <p
                        className={`font-black tabular-nums ${rank === 1 ? "text-amber-300 text-lg" : "text-white"}`}
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {r.elo}
                      </p>
                      <p className="text-[9px] font-bold uppercase text-zinc-600">ELO</p>
                      <p className="text-[9px] font-black uppercase tracking-tight text-fuchsia-500/80 max-w-[4.5rem] truncate ml-auto">
                        {tierForElo(r.elo).abbr}
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        className={`font-black tabular-nums ${rank === 1 ? "text-fuchsia-300 text-lg" : "text-fuchsia-200/90"}`}
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {mc.toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold uppercase text-zinc-600">MC</p>
                    </>
                  )}
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

function TopThreePodium({ rows, board }: { rows: LeaderboardProfileRow[]; board: Board }) {
  const first = rows[0];
  const second = rows[1];
  const third = rows[2];
  if (!first) return null;

  const items: { row: LeaderboardProfileRow | undefined; place: 1 | 2 | 3; pillarMinH: string }[] = [
    { row: second, place: 2, pillarMinH: "min-h-[6.5rem] sm:min-h-[8rem]" },
    { row: first, place: 1, pillarMinH: "min-h-[9rem] sm:min-h-[11rem]" },
    { row: third, place: 3, pillarMinH: "min-h-[5.5rem] sm:min-h-[6.5rem]" },
  ];

  return (
    <div className="border border-white/10 bg-zinc-950 p-4 sm:p-6">
      <p className="text-center text-[10px] font-black uppercase tracking-[0.35em] text-zinc-500 mb-1">Podium</p>
      <p className="text-center text-[9px] text-zinc-600 uppercase tracking-widest mb-4">Top 3</p>
      <div className="flex items-end justify-center gap-1.5 sm:gap-3 max-w-md mx-auto">
        {items.map(({ row, place, pillarMinH }) => (
          <div
            key={place}
            className={`flex min-w-0 flex-1 flex-col items-center ${!row ? "opacity-40" : ""}`}
          >
            <div className="mb-2 flex w-full flex-col items-center text-center min-h-[4.25rem]">
              {row ? (
                <>
                  <div className="mx-auto mb-1 size-11 sm:size-14 overflow-hidden border-2 border-white/20 bg-zinc-900 shadow-lg">
                    {row.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.avatar_url} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <User className="size-5 sm:size-6 text-zinc-600" />
                      </div>
                    )}
                  </div>
                  <p className="w-full truncate px-0.5 text-[10px] sm:text-xs font-black uppercase text-white">
                    {row.username ?? "Mogger"}
                  </p>
                  <p className="text-[10px] font-black tabular-nums text-amber-200/95">
                    {board === "elo" ? `${row.elo} ELO` : `${Number(row.total_credits).toLocaleString()} MC`}
                  </p>
                </>
              ) : (
                <span className="text-[10px] text-zinc-600 pt-8">—</span>
              )}
            </div>
            <div
              className={`flex w-full flex-col items-center rounded-t-lg border border-b-0 pt-3 ${pillarMinH} ${
                place === 1
                  ? "border-amber-500/55 bg-gradient-to-b from-amber-500/30 via-amber-600/10 to-zinc-950 shadow-[0_-8px_32px_rgba(245,158,11,0.12)]"
                  : place === 2
                    ? "border-zinc-400/45 bg-gradient-to-b from-zinc-400/20 to-zinc-950"
                    : "border-orange-700/45 bg-gradient-to-b from-orange-800/25 to-zinc-950"
              }`}
            >
              <span
                className="text-xl sm:text-2xl font-black tabular-nums text-white"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {place}
              </span>
              {place === 1 && <Crown className="mt-0.5 size-5 text-amber-300 drop-shadow-md" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EloTierGraph({ yourElo }: { yourElo: number | null }) {
  return (
    <div className="border border-white/10 bg-zinc-950/90 p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">ELO ladder</p>
        {yourElo !== null && (
          <p className="text-[10px] font-bold text-fuchsia-400/90">
            You: <span className="tabular-nums text-white">{yourElo}</span>
            <span className="text-zinc-500 font-black uppercase ml-2">{tierForElo(yourElo).abbr}</span>
          </p>
        )}
      </div>

      <div className="relative pt-3">
        {yourElo !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 flex flex-col items-center -translate-x-1/2"
            style={{ left: `${eloToPercentOnGraph(yourElo)}%` }}
            title={`Your ELO: ${yourElo}`}
          >
            <div className="size-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-fuchsia-400 drop-shadow-[0_0_6px_rgba(217,70,239,0.9)]" />
          </div>
        )}
        <div className="flex h-8 w-full overflow-hidden rounded-md border border-white/15 shadow-inner">
          {ELO_TIER_BANDS.map((band, i) => (
            <div
              key={band.abbr}
              title={`${band.full}: ${band.min}–${band.max >= ELO_GRAPH_MAX ? `${band.min}+` : band.max}`}
              className={`${band.barClass} flex min-w-0 items-center justify-center border-r border-black/30 last:border-r-0 px-0.5`}
              style={{ width: `${segmentWidthPercent(i)}%` }}
            >
              <span className="truncate text-center text-[7px] font-black uppercase tracking-tight text-white drop-shadow-sm sm:text-[8px]">
                {band.abbr}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-500">
        <span className="text-zinc-400 font-bold">Scale 0–{ELO_GRAPH_MAX}.</span> Sub 5 ≤450 · LTN 451–799 · MTN 800–999 ·
        HTN 1000–1199 · Chad lite 1200–1599 · Chad 1600–1799 · Adam lite 1800+.
      </p>
    </div>
  );
}
