"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { queueForFreeMatch, submitMoleculeBetOffer } from "@/app/actions";
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
  const { token: authToken } = useAuth();
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

  useEffect(() => { setMatch(existingMatch); }, [existingMatch]);

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
            setPotAnimating(true);
            setAgreed(true);
            setTimeout(() => router.push(`/match/${match.id}`), 1800);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match?.id, isNegotiating, router]);

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

  useEffect(() => {
    if (!isQueued) { setQueueSeconds(0); return; }
    const t = setInterval(() => setQueueSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isQueued]);

  useEffect(() => {
    if (isNegotiating) inputRef.current?.focus();
  }, [isNegotiating]);

  useEffect(() => {
    if (isLive && match?.id) {
      setPotAnimating(true);
      setAgreed(true);
      setTimeout(() => router.push(`/match/${match.id}`), 1800);
    }
  }, [isLive, match?.id, router]);

  function onQueue() {
    startTransition(async () => {
      const token = authToken;
      if (!token) return;
      await queueForFreeMatch(token, 1);
      await onRefresh?.();
    });
  }

  function onOfferChange(val: string) {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    setMyOffer(cleaned);

    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    if (!cleaned || !match?.id) return;
    const amount = parseInt(cleaned, 10);
    if (amount < 1) return;
    submitTimerRef.current = setTimeout(async () => {
      const token = authToken;
      if (!token) return;
      try {
        await submitMoleculeBetOffer(token, match.id, amount);
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

        {/* Idle */}
        {!match && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="border border-white/10 bg-zinc-950 p-6 text-center space-y-2">
              <p className="text-zinc-400 text-sm">Connect with a random opponent. Negotiate your bet live.</p>
              <p className="text-xs text-zinc-600 uppercase tracking-widest">Min 1 MOG coin required</p>
            </div>
            <button
              onClick={onQueue}
              disabled={isPending}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 py-4 text-base font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
            >
              {isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Finding opponent…</>
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
            className="border border-white/10 bg-zinc-950 p-8 text-center space-y-5"
          >
            <div className="relative mx-auto size-16">
              <div className="absolute inset-0 border-2 border-fuchsia-500/30 animate-ping" />
              <div className="absolute inset-0 border-2 border-fuchsia-500/60 animate-pulse" />
              <div className="relative flex size-full items-center justify-center border border-fuchsia-500/40 bg-fuchsia-500/10">
                <Swords className="size-6 text-fuchsia-400" />
              </div>
            </div>
            <div>
              <p className="text-lg font-black text-white uppercase tracking-wide" style={{ fontFamily: "var(--font-heading)" }}>
                Hunting for prey…
              </p>
              <p className="text-zinc-600 text-sm mt-1 tabular-nums">{queueSeconds}s in queue</p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="size-1.5 bg-fuchsia-500 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Negotiation */}
        {isNegotiating && !agreed && (
          <motion.div
            key="negotiating"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-6"
          >
            {/* Timer bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 uppercase tracking-widest">Agree on bet</span>
                <span className={`font-black tabular-nums ${timeLeft <= 3 ? "text-red-400" : "text-fuchsia-400"}`}>
                  {timeLeft}s
                </span>
              </div>
              <div className="h-1 w-full bg-zinc-900 overflow-hidden">
                <motion.div
                  className={`h-full ${timeLeft <= 3 ? "bg-red-500" : "bg-fuchsia-500"}`}
                  initial={{ width: "100%" }}
                  animate={{ width: `${(timeLeft / 10) * 100}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>

            {/* Battle area */}
            <div className="relative border border-white/10 bg-black overflow-hidden" style={{ minHeight: 220 }}>
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                <span className="text-xs text-zinc-700 uppercase tracking-widest">video starts after bet agreed</span>
              </div>

              <div className="flex items-end justify-between px-4 sm:px-12 pb-8 pt-16">
                {/* Your side */}
                <div className="flex flex-col items-center gap-2">
                  <AnimatePresence>
                    {displayMyOffer && (
                      <motion.div
                        key={displayMyOffer}
                        initial={{ opacity: 0, y: 8, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="border border-fuchsia-500/50 bg-fuchsia-500/10 px-3 py-1"
                      >
                        <span className="text-fuchsia-300 font-black text-lg tabular-nums">{displayMyOffer} MC</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="size-16 border-2 border-fuchsia-500/50 bg-fuchsia-500/10 flex items-center justify-center">
                    <span className="text-fuchsia-300 font-black text-xs uppercase">YOU</span>
                  </div>
                </div>

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
                        className="border border-red-500/50 bg-red-500/10 px-3 py-1"
                      >
                        <span className="text-red-300 font-black text-lg tabular-nums">{displayOppOffer} MC</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="size-16 border-2 border-red-500/50 bg-red-500/10 flex items-center justify-center">
                    <span className="text-red-300 font-black text-xs uppercase truncate max-w-[52px] text-center px-1">
                      {opponentName?.slice(0, 5) ?? "???"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bet input */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-600 text-center uppercase tracking-widest">Type your bet — match theirs to agree</p>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={myOffer}
                onChange={(e) => onOfferChange(e.target.value)}
                placeholder="0"
                className="w-full border border-white/10 bg-zinc-950 px-4 py-4 text-center text-2xl font-black text-white placeholder-zinc-800 focus:border-fuchsia-500 focus:outline-none tabular-nums"
              />
              <p className="text-xs text-zinc-700 text-center uppercase tracking-widest">MOG coins</p>
            </div>
          </motion.div>
        )}

        {/* Pot merge */}
        {agreed && potAnimating && (
          <motion.div
            key="agreed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="border border-yellow-500/30 bg-zinc-950 p-8 text-center space-y-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <p className="text-xs text-yellow-500/70 uppercase tracking-widest mb-2 font-bold">Pot</p>
              <p className="text-5xl font-black text-yellow-400 tabular-nums" style={{ fontFamily: "var(--font-heading)" }}>
                {potSize?.toLocaleString()} MC
              </p>
            </motion.div>
            <p className="text-zinc-500 text-sm uppercase tracking-widest">Bet agreed — entering arena…</p>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="size-1.5 bg-yellow-400 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Already live fallback */}
        {isLive && !potAnimating && match && (
          <motion.div
            key="live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <button
              onClick={() => router.push(`/match/${match.id}`)}
              className="w-full bg-red-600 hover:bg-red-500 py-4 text-base font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
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
