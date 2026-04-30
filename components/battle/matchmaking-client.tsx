"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { queueForBattle, submitBetOffer } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { Swords, Loader2, ArrowRight } from "lucide-react";
import type { Database } from "@/lib/types/database";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export function MatchmakingClient({
  existingMatch,
  userId,
  opponentName,
  onRefresh,
}: {
  existingMatch: MatchRow | null;
  userId: string;
  opponentName: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const { getAccessToken } = usePrivy();
  const [match, setMatch] = useState<MatchRow | null>(existingMatch);
  const [queueSeconds, setQueueSeconds] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [myOffer, setMyOffer] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [agreed, setAgreed] = useState(false);
  const [potAnimating, setPotAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isQueued = Boolean(match && match.status === "waiting" && !match.player2_id);
  const isNegotiating = match?.status === "matched";
  const isLive = match?.status === "live";

  const isP1 = match?.player1_id === userId;
  const myRawOffer = isP1 ? match?.player1_bet_offer : match?.player2_bet_offer;
  const oppRawOffer = isP1 ? match?.player2_bet_offer : match?.player1_bet_offer;

  // Sync from parent polling
  useEffect(() => { setMatch(existingMatch); }, [existingMatch]);

  // Supabase realtime for negotiation phase
  useEffect(() => {
    if (!match?.id || !isNegotiating) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`match:${match.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${match.id}` },
        (payload) => {
          const updated = payload.new as MatchRow;
          setMatch(updated);
          if (updated.status === "live") {
            // Both agreed — trigger pot animation then redirect
            setPotAnimating(true);
            setAgreed(true);
            setTimeout(() => router.push(`/match/${match.id}`), 1800);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match?.id, isNegotiating, router]);

  // Negotiation countdown
  useEffect(() => {
    if (!isNegotiating || !match?.negotiation_deadline) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(match.negotiation_deadline!).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [isNegotiating, match?.negotiation_deadline]);

  // Queue timer
  useEffect(() => {
    if (!isQueued) { setQueueSeconds(0); return; }
    const t = setInterval(() => setQueueSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isQueued]);

  // Auto-focus input during negotiation
  useEffect(() => {
    if (isNegotiating) inputRef.current?.focus();
  }, [isNegotiating]);

  // If match goes live from polling (realtime fallback)
  useEffect(() => {
    if (isLive && match?.id) {
      setPotAnimating(true);
      setAgreed(true);
      setTimeout(() => router.push(`/match/${match.id}`), 1800);
    }
  }, [isLive, match?.id, router]);

  function onQueue() {
    startTransition(async () => {
      const token = await getAccessToken();
      if (!token) return;
      await queueForBattle(token);
      await onRefresh?.();
    });
  }

  function onOfferChange(val: string) {
    // Only digits
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    setMyOffer(cleaned);

    // Debounce submit to DB
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    if (!cleaned || !match?.id) return;
    const amount = parseInt(cleaned, 10);
    if (amount < 1) return;
    submitTimerRef.current = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        await submitBetOffer(token, match.id, amount);
        await onRefresh?.();
      } catch (e) {
        console.error(e);
      }
    }, 300);
  }

  const potSize = agreed && match?.bet_amount ? match.bet_amount * 2 : null;
  const displayMyOffer = myOffer || (myRawOffer ? String(myRawOffer) : "");
  const displayOppOffer = oppRawOffer ? String(oppRawOffer) : "";

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">

        {/* Idle: Enter queue */}
        {!match && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center space-y-2">
              <p className="text-zinc-400 text-sm">Connect with a random opponent. Negotiate your bet live.</p>
              <p className="text-xs text-zinc-600">Min 1 MOG coin required to enter</p>
            </div>
            <button
              onClick={onQueue}
              disabled={isPending}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 disabled:opacity-60 py-4 text-base font-bold text-white transition-all flex items-center justify-center gap-2"
            >
              {isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Finding opponent...</>
              ) : (
                <><Swords className="size-4" /> Enter the Arena</>
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
              <p className="text-zinc-500 text-sm mt-1">{queueSeconds}s in queue</p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="size-1.5 rounded-full bg-fuchsia-500 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Negotiation phase */}
        {isNegotiating && !agreed && (
          <motion.div
            key="negotiating"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-6"
          >
            {/* Timer bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Opponent found — agree on bet</span>
                <span className={`font-bold tabular-nums ${timeLeft <= 3 ? "text-red-400" : "text-fuchsia-300"}`}>
                  {timeLeft}s
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-red-500"
                  initial={{ width: "100%" }}
                  animate={{ width: `${(timeLeft / 10) * 100}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>

            {/* Battle area — 10s black screen with heads + offers */}
            <div className="relative rounded-2xl border border-zinc-800 bg-black overflow-hidden" style={{ minHeight: 220 }}>
              {/* Black screen label */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                <span className="text-xs text-zinc-600 uppercase tracking-widest">video starts after bet agreed</span>
              </div>

              <div className="flex items-end justify-between px-4 sm:px-12 pb-8 pt-16">
                {/* Your side */}
                <div className="flex flex-col items-center gap-2">
                  {/* Bet offer above head */}
                  <AnimatePresence>
                    {displayMyOffer && (
                      <motion.div
                        key={displayMyOffer}
                        initial={{ opacity: 0, y: 8, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/40 px-3 py-1"
                      >
                        <span className="text-fuchsia-200 font-bold text-lg tabular-nums">{displayMyOffer} MC</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Head */}
                  <div className="size-16 rounded-full border-2 border-fuchsia-500/50 bg-fuchsia-500/10 flex items-center justify-center">
                    <span className="text-fuchsia-300 font-bold text-xs">YOU</span>
                  </div>
                </div>

                {/* Center VS */}
                <div className="flex flex-col items-center gap-1 pb-4">
                  <span className="text-zinc-700 font-black text-xl tracking-widest">VS</span>
                </div>

                {/* Opponent side */}
                <div className="flex flex-col items-center gap-2">
                  <AnimatePresence>
                    {displayOppOffer && (
                      <motion.div
                        key={displayOppOffer}
                        initial={{ opacity: 0, y: 8, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1"
                      >
                        <span className="text-red-200 font-bold text-lg tabular-nums">{displayOppOffer} MC</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="size-16 rounded-full border-2 border-red-500/50 bg-red-500/10 flex items-center justify-center">
                    <span className="text-red-300 font-bold text-xs uppercase truncate max-w-[52px] text-center px-1">
                      {opponentName?.slice(0, 5) ?? "???"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bet input */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 text-center">Type your bet — match their amount to agree</p>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={myOffer}
                onChange={(e) => onOfferChange(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-center text-2xl font-bold text-white placeholder-zinc-700 focus:border-fuchsia-500/60 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30 tabular-nums"
              />
              <p className="text-xs text-zinc-600 text-center">MOG coins</p>
            </div>
          </motion.div>
        )}

        {/* Pot merge animation */}
        {agreed && potAnimating && (
          <motion.div
            key="agreed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-yellow-500/30 bg-zinc-900/80 p-8 text-center space-y-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <p className="text-xs text-yellow-400/70 uppercase tracking-widest mb-2">Pot</p>
              <p className="text-5xl font-black text-yellow-300" style={{ fontFamily: "var(--font-heading)" }}>
                {potSize?.toLocaleString()} MC
              </p>
            </motion.div>
            <p className="text-zinc-400 text-sm">Bet agreed — entering arena...</p>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="size-1.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Already live (direct nav fallback) */}
        {isLive && !potAnimating && match && (
          <motion.div
            key="live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <button
              onClick={() => router.push(`/match/${match.id}`)}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 py-4 text-base font-bold text-white transition-all flex items-center justify-center gap-2"
            >
              <Swords className="size-4" />
              Enter the Arena
              <ArrowRight className="size-4" />
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
