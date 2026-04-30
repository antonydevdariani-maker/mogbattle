"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { confirmBattleMatch, queueForBattle } from "@/app/actions";
import { Swords, Loader2, CheckCircle2, ArrowRight, Zap } from "lucide-react";

const PRESETS = [50, 100, 250, 500, 1000];

type BattleMatch = {
  id: string;
  player1_id: string;
  player2_id: string | null;
  bet_amount: number;
  player1_confirmed: boolean;
  player2_confirmed: boolean;
  status: "waiting" | "live" | "completed" | "cancelled";
};

export function MatchmakingClient({
  existingMatch,
  userId,
  opponentName,
  onRefresh,
}: {
  existingMatch: BattleMatch | null;
  userId: string;
  opponentName: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const { getAccessToken } = usePrivy();
  const [bet, setBet] = useState(100);
  const [match, setMatch] = useState<BattleMatch | null>(existingMatch);
  const [queueSeconds, setQueueSeconds] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isQueued = Boolean(match && !match.player2_id);
  const isFound = Boolean(match?.player2_id);
  const bothConfirmed = Boolean(match?.player1_confirmed && match?.player2_confirmed);
  const iAmP1 = match?.player1_id === userId;
  const iConfirmed = iAmP1 ? match?.player1_confirmed : match?.player2_confirmed;

  useEffect(() => {
    setMatch(existingMatch);
  }, [existingMatch]);

  // Queue timer
  useEffect(() => {
    if (!isQueued) { setQueueSeconds(0); return; }
    const t = setInterval(() => setQueueSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isQueued]);

  function onQueue() {
    startTransition(async () => {
      const token = await getAccessToken();
      if (!token) return;
      await queueForBattle(token, bet);
      await onRefresh?.();
    });
  }

  function onConfirm() {
    if (!match?.id) return;
    startTransition(async () => {
      const token = await getAccessToken();
      if (!token) return;
      await confirmBattleMatch(token, match.id);
      await onRefresh?.();
    });
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {/* Default: stake selector + queue button */}
        {!match && (
          <motion.div
            key="selector"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Choose Your Stake</p>
              <div className="grid grid-cols-5 gap-2">
                {PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBet(v)}
                    className={`rounded-xl border py-3 text-sm font-bold transition-all ${
                      bet === v
                        ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200 shadow-[0_0_12px_oklch(0.72_0.26_305/0.3)]"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {v >= 1000 ? `${v / 1000}K` : v}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">Pot size</p>
                <p className="text-xl font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
                  {(bet * 2).toLocaleString()} MC
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">Your stake</p>
                <p className="text-sm font-semibold text-fuchsia-300">{bet.toLocaleString()} MC</p>
              </div>
            </div>

            <button
              onClick={onQueue}
              disabled={isPending}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 disabled:opacity-60 py-4 text-base font-bold text-white transition-all glow-red flex items-center justify-center gap-2"
            >
              {isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Finding opponent...</>
              ) : (
                <><Swords className="size-4" /> Enter the Queue</>
              )}
            </button>
          </motion.div>
        )}

        {/* In queue */}
        {isQueued && (
          <motion.div
            key="queued"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-6 text-center space-y-4"
          >
            <div className="relative mx-auto size-16">
              <div className="absolute inset-0 rounded-full border-2 border-fuchsia-500/30 animate-ping" />
              <div className="absolute inset-0 rounded-full border-2 border-fuchsia-500/60 animate-pulse" />
              <div className="relative flex size-full items-center justify-center rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10">
                <Swords className="size-6 text-fuchsia-400" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
                Hunting for prey...
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {queueSeconds}s · {bet.toLocaleString()} MC stake
              </p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-1.5 rounded-full bg-fuchsia-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Opponent found */}
        {isFound && match && (
          <motion.div
            key="found"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-4"
          >
            {/* VS card */}
            <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-zinc-900/80 p-6">
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, oklch(0.72 0.26 305) 0%, transparent 70%)`,
                }}
              />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex-1 text-center">
                  <div className="inline-flex size-12 items-center justify-center rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 mb-2">
                    <span className="text-lg font-bold text-fuchsia-300">YOU</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {iAmP1 && match.player1_confirmed ? (
                      <span className="text-green-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="size-3" /> Confirmed
                      </span>
                    ) : !iAmP1 && match.player2_confirmed ? (
                      <span className="text-green-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="size-3" /> Confirmed
                      </span>
                    ) : (
                      "Pending"
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1">
                    <p className="text-xs font-black tracking-widest text-zinc-300">VS</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-yellow-400">
                    <Zap className="size-3" />
                    {match.bet_amount.toLocaleString()} MC
                  </div>
                </div>

                <div className="flex-1 text-center">
                  <div className="inline-flex size-12 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 mb-2">
                    <span className="text-xs font-bold text-red-300 uppercase truncate max-w-[44px]">
                      {opponentName?.slice(0, 4) ?? "???"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {iAmP1 ? (
                      match.player2_confirmed ? (
                        <span className="text-green-400 flex items-center justify-center gap-1">
                          <CheckCircle2 className="size-3" /> Confirmed
                        </span>
                      ) : "Pending"
                    ) : (
                      match.player1_confirmed ? (
                        <span className="text-green-400 flex items-center justify-center gap-1">
                          <CheckCircle2 className="size-3" /> Confirmed
                        </span>
                      ) : "Pending"
                    )}
                  </p>
                </div>
              </div>
            </div>

            {!bothConfirmed ? (
              <button
                onClick={onConfirm}
                disabled={isPending || Boolean(iConfirmed)}
                className="w-full rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 py-4 text-base font-bold text-white transition-all glow-fuchsia flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <><Loader2 className="size-4 animate-spin" /> Confirming...</>
                ) : iConfirmed ? (
                  <><CheckCircle2 className="size-4" /> Confirmed — waiting for opponent</>
                ) : (
                  <><Swords className="size-4" /> Lock In & Confirm</>
                )}
              </button>
            ) : (
              <button
                onClick={() => router.push(`/match/${match.id}`)}
                className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 py-4 text-base font-bold text-white transition-all glow-red flex items-center justify-center gap-2"
              >
                <Swords className="size-4" />
                Enter the Arena
                <ArrowRight className="size-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
