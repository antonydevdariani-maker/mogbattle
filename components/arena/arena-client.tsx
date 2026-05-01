"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  queueForBattle,
  submitBetOffer,
  finalizeMatchResult,
  loadBattleQueueState,
  loadProfileSummary,
  cancelWaitingMatch,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { useAgoraVideo } from "@/components/match/agora-video";
import type { Database } from "@/lib/types/database";
import {
  Swords,
  Flame,
  Trophy,
  Skull,
  Zap,
  Loader2,
  CheckCircle2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { ICameraVideoTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
type ArenaPhase =
  | "idle"
  | "queued"
  | "negotiating"
  | "live"
  | "countdown"
  | "analyzing"
  | "verdict"
  | "done";

const METRICS = [
  "Jawline Definition",
  "Hunter Eye Angle",
  "Facial Harmony",
  "FWHR Ratio",
  "Canthal Tilt",
  "Bone Structure",
];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatQueueHandle(username: string | null, wallet: string | null): string {
  const w = wallet?.trim();
  if (w && w.length >= 8) {
    const core = w.startsWith("0x") ? w.slice(2) : w;
    if (core.length >= 8) {
      return `${core.slice(0, 4).toUpperCase()}…${core.slice(-4).toUpperCase()}`;
    }
  }
  return username?.trim() || "MOGGER";
}

function queueMonogram(username: string | null, wallet: string | null): string {
  const u = username?.trim();
  if (u && u.length >= 2) return u.slice(0, 2).toUpperCase();
  const w = (wallet ?? "").replace(/^0x/i, "");
  if (w.length >= 2) return w.slice(0, 2).toUpperCase();
  return "MG";
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function ArenaClient({
  initialBalance,
  initialMatch,
  initialOpponentName,
  userId,
  displayName,
  walletAddress,
}: {
  initialBalance: number;
  initialMatch: MatchRow | null;
  initialOpponentName: string | null;
  userId: string;
  displayName: string | null;
  walletAddress: string | null;
}) {
  const { getAccessToken } = usePrivy();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);

  const [match, setMatch] = useState<MatchRow | null>(initialMatch);
  const [opponentName, setOpponentName] = useState<string | null>(initialOpponentName);
  const [balance, setBalance] = useState(initialBalance);
  const [myOfferStr, setMyOfferStr] = useState("");
  const [timeLeft, setTimeLeft] = useState(10);
  const [queueSecs, setQueueSecs] = useState(0);
  const [queueSession, setQueueSession] = useState(0);
  const [oppTyping, setOppTyping] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [oppReady, setOppReady] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [revealedMetrics, setRevealedMetrics] = useState<number[]>([]);
  const [metricScores, setMetricScores] = useState<{ p1: number; p2: number }[]>([]);
  const [scoreP1, setScoreP1] = useState<number | null>(initialMatch?.ai_score_p1 ?? null);
  const [scoreP2, setScoreP2] = useState<number | null>(initialMatch?.ai_score_p2 ?? null);

  const [queueTimedOut, setQueueTimedOut] = useState(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOppOffer = useRef<number | null>(null);
  const analysisRunning = useRef(false);
  const queueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchmakingIntentRef = useRef(false);
  const timedOutBattleRef = useRef(false);
  const queueTimedOutRef = useRef(false);

  const derivePhase = useCallback((m: MatchRow | null): ArenaPhase => {
    if (!m) return "idle";
    if (m.status === "waiting") return "queued";
    if (m.status === "matched") return "negotiating";
    if (m.status === "live") return "live";
    if (m.status === "completed") return "done";
    return "idle";
  }, []);

  const [phase, setPhase] = useState<ArenaPhase>(() => {
    const base = derivePhase(initialMatch);
    if (base === "done") {
      setMyReady(true);
      setOppReady(true);
      if (initialMatch?.ai_score_p1) {
        setRevealedMetrics(METRICS.map((_, i) => i));
        setMetricScores(METRICS.map(() => ({ p1: 75 + Math.random() * 25, p2: 75 + Math.random() * 25 })));
      }
    }
    return base;
  });

  const isP1 = match?.player1_id === userId;
  const myRawOffer = isP1 ? match?.player1_bet_offer : match?.player2_bet_offer;
  const oppRawOffer = isP1 ? match?.player2_bet_offer : match?.player1_bet_offer;
  const displayMyOffer = myOfferStr || (myRawOffer ? String(myRawOffer) : "");
  const displayOppOffer = oppRawOffer ? String(oppRawOffer) : "";

  const myScore = isP1 ? scoreP1 : scoreP2;
  const oppScore = isP1 ? scoreP2 : scoreP1;
  const iWon = match?.winner_id
    ? match.winner_id === userId
    : myScore !== null && oppScore !== null
    ? myScore >= oppScore
    : false;

  const videoEnabled =
    ["live", "countdown", "analyzing", "verdict", "done"].includes(phase) && !!match?.id;

  const { localVideoTrack, remoteVideoTrack } = useAgoraVideo({
    channelName: match?.id ?? "",
    uid: isP1 ? 1 : 2,
    enabled: videoEnabled,
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const p = await loadProfileSummary(token);
    setBalance(p?.total_credits ?? 0);
  }, [getAccessToken]);

  const poll = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const s = await loadBattleQueueState(token);
    const newMatch = s.activeMatch as MatchRow | null;
    setMatch(newMatch);
    setOpponentName(s.opponentName);
    setPhase((prev) => {
      if (["countdown", "analyzing", "verdict", "done"].includes(prev)) return prev;
      const derived = derivePhase(newMatch);
      if (newMatch) {
        timedOutBattleRef.current = false;
        matchmakingIntentRef.current = false;
        return derived;
      }
      if (timedOutBattleRef.current) return "queued";
      if (matchmakingIntentRef.current) return "queued";
      return derived;
    });
  }, [getAccessToken, derivePhase]);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === "idle" || phase === "done") return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [phase, poll]);

  useEffect(() => {
    if (!match?.id || phase !== "negotiating") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`arena:${match.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${match.id}` },
        (payload) => {
          const updated = payload.new as MatchRow;
          setMatch(updated);
          const curOpp = isP1 ? updated.player2_bet_offer : updated.player1_bet_offer;
          if (curOpp !== prevOppOffer.current) {
            prevOppOffer.current = curOpp;
            setOppTyping(true);
            if (oppTypingRef.current) clearTimeout(oppTypingRef.current);
            oppTypingRef.current = setTimeout(() => setOppTyping(false), 2000);
          }
          if (updated.status === "live") {
            setPhase("live");
            refreshBalance();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match?.id, phase, isP1, refreshBalance]);

  useEffect(() => {
    if (phase !== "negotiating" || !match?.negotiation_deadline) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((new Date(match.negotiation_deadline!).getTime() - Date.now()) / 1000));
      setTimeLeft(rem);
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [phase, match?.negotiation_deadline]);

  useEffect(() => {
    queueTimedOutRef.current = queueTimedOut;
  }, [queueTimedOut]);

  useEffect(() => {
    if (phase !== "queued") {
      setQueueSecs(0);
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
        queueTimeoutRef.current = null;
      }
      return;
    }
    setQueueTimedOut(false);
    setQueueSecs(0);
    const t = setInterval(() => {
      setQueueSecs((s) => (queueTimedOutRef.current ? s : s + 1));
    }, 1000);
    queueTimeoutRef.current = setTimeout(() => setQueueTimedOut(true), 30_000);
    return () => {
      clearInterval(t);
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
        queueTimeoutRef.current = null;
      }
    };
  }, [phase, queueSession]);

  useEffect(() => {
    if (!queueTimedOut || phase !== "queued") return;
    matchmakingIntentRef.current = false;
    timedOutBattleRef.current = true;
    startTransition(async () => {
      const token = await getAccessToken();
      if (token) {
        try {
          await cancelWaitingMatch(token);
        } catch {
          /* ignore */
        }
      }
      setMatch(null);
    });
  }, [queueTimedOut, phase, getAccessToken]);

  // Keyboard number input while searching / negotiating
  useEffect(() => {
    if (phase !== "negotiating" && phase !== "queued") return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) {
        setMyOfferStr((prev) => {
          const next = (prev + e.key).slice(0, 6);
          scheduleOfferSubmit(next);
          return next;
        });
      }
      if (e.key === "Backspace") {
        setMyOfferStr((prev) => {
          const next = prev.slice(0, -1);
          scheduleOfferSubmit(next);
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, match?.id, balance, match?.status]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function scheduleOfferSubmit(val: string) {
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    const amount = parseInt(val, 10);
    if (!amount || amount < 1 || !match?.id || match.status !== "matched") return;
    const capped = Math.min(amount, balance);
    submitTimerRef.current = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return;
      try { await submitBetOffer(token, match.id, capped); } catch {}
    }, 300);
  }

  function onOfferChange(val: string) {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    const amount = parseInt(cleaned, 10);
    const capped = !isNaN(amount) && amount > balance ? String(balance) : cleaned;
    setMyOfferStr(capped);
    scheduleOfferSubmit(capped);
  }

  function setQuickBet(amount: number) {
    const capped = String(Math.min(amount, balance));
    setMyOfferStr(capped);
    scheduleOfferSubmit(capped);
  }

  function setMaxBet() {
    setMyOfferStr(String(balance));
    scheduleOfferSubmit(String(balance));
  }

  function onQueue() {
    matchmakingIntentRef.current = true;
    timedOutBattleRef.current = false;
    setQueueTimedOut(false);
    setQueueSecs(0);
    setQueueSession((s) => s + 1);
    setPhase("queued");
    setIsPending(true);
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          matchmakingIntentRef.current = false;
          setPhase("idle");
          return;
        }
        await queueForBattle(token);
        await poll();
      } catch {
        matchmakingIntentRef.current = false;
        setPhase("idle");
      } finally {
        setIsPending(false);
      }
    });
  }

  async function backToArenaLanding() {
    timedOutBattleRef.current = false;
    matchmakingIntentRef.current = false;
    setQueueTimedOut(false);
    setQueueSecs(0);
    const token = await getAccessToken();
    if (token) {
      try {
        await cancelWaitingMatch(token);
      } catch {
        /* ignore */
      }
    }
    setMatch(null);
    setPhase("idle");
    await refreshBalance();
  }

  async function startAnalysis() {
    if (analysisRunning.current) return;
    analysisRunning.current = true;

    setPhase("countdown");
    for (let i = 3; i >= 1; i--) { setCountdown(i); await pause(900); }

    setPhase("analyzing");
    setRevealedMetrics([]);
    setMetricScores([]);
    const scores: { p1: number; p2: number }[] = [];
    for (let i = 0; i < METRICS.length; i++) {
      await pause(1400 + Math.random() * 700);
      const ms = { p1: 70 + Math.random() * 30, p2: 70 + Math.random() * 30 };
      scores.push(ms);
      setMetricScores([...scores]);
      setRevealedMetrics((prev) => [...prev, i]);
    }

    await pause(900);
    const p1Total = Number((scores.reduce((a, s) => a + s.p1, 0) / scores.length).toFixed(2));
    const p2Total = Number((scores.reduce((a, s) => a + s.p2, 0) / scores.length).toFixed(2));
    setScoreP1(p1Total);
    setScoreP2(p2Total);

    setPhase("verdict");
    await pause(2800);
    setPhase("done");

    if (isP1 && match) {
      startTransition(async () => {
        const token = await getAccessToken();
        if (!token) return;
        await finalizeMatchResult(token, { matchId: match.id, aiScoreP1: p1Total, aiScoreP2: p2Total });
        refreshBalance();
      });
    }
  }

  function resetArena() {
    matchmakingIntentRef.current = false;
    timedOutBattleRef.current = false;
    setMatch(null);
    setPhase("idle");
    setMyOfferStr("");
    setScoreP1(null);
    setScoreP2(null);
    setRevealedMetrics([]);
    setMetricScores([]);
    setMyReady(false);
    setOppReady(false);
    analysisRunning.current = false;
    refreshBalance();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (phase === "idle") {
    return <IdleScreen onQueue={onQueue} isPending={isPending} balance={balance} />;
  }

  const isQueued = phase === "queued";
  const showAnalysis = ["analyzing", "verdict"].includes(phase);
  const isDone = phase === "done";
  const yourHandle = formatQueueHandle(displayName, walletAddress);
  const yourMonogram = queueMonogram(displayName, walletAddress);
  const findRemain = Math.max(0, 30 - queueSecs);

  return (
    <div
      className="relative w-full flex flex-col gap-0 pb-4 bg-[#030308]"
      style={{ minHeight: "calc(100dvh - 3.5rem)" }}
    >
      {/* Grid + scanline */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.25) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      <ArenaTopBar balance={balance} />

      {isQueued && !queueTimedOut && (
        <div className="relative z-10 flex w-full justify-center px-4 pt-5 pb-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <p
              className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-[0.12em] text-cyan-300 drop-shadow-[0_0_24px_rgba(34,211,238,0.55)]"
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            >
              Finding opponent...{" "}
              <span className="tabular-nums text-white tracking-normal">{findRemain}s</span>
            </p>
          </motion.div>
        </div>
      )}

      {/* Split screen — Omegle-style; mobile stacks with VS between */}
      <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[1fr_120px_1fr] gap-3 px-2 md:px-3 pt-1 md:pt-2">
        {/* LEFT — Opponent */}
        <div className="flex flex-col gap-2 order-1">
          <PlayerPanel
            side="opponent"
            name={opponentName ?? "???"}
            footerOverride={isQueued && !queueTimedOut ? "???" : null}
            videoTrack={remoteVideoTrack}
            hasVideo={videoEnabled}
            displayOffer={displayOppOffer}
            isTyping={oppTyping}
            phase={phase}
            isReady={oppReady}
            score={isP1 ? oppScore : myScore}
            isSearching={isQueued && !queueTimedOut}
            queueTimedOut={queueTimedOut}
          />
          {showAnalysis && (
            <div className="md:hidden">
              <MetricsList metrics={METRICS} metricScores={metricScores} revealedMetrics={revealedMetrics} side="p2" isP1={isP1} />
            </div>
          )}
        </div>

        {/* CENTER — VS + status */}
        <div className="order-2 flex flex-col items-center justify-start gap-3 py-2 md:py-6">
          <GlowingVS large={isQueued && !queueTimedOut} />
          <div className="md:hidden w-full max-w-xs text-center space-y-2">
            {phase === "negotiating" && (
              <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400">
                Bet · {timeLeft}s
              </p>
            )}
          </div>
          <div className="hidden md:flex w-full flex-col items-center">
            <CenterColumn
              phase={phase}
              countdown={countdown}
              match={match}
              timeLeft={timeLeft}
              metricScores={metricScores}
              revealedMetrics={revealedMetrics}
              isP1={isP1}
            />
          </div>
        </div>

        {/* RIGHT — You */}
        <div className="flex flex-col gap-3 order-3">
          <PlayerPanel
            side="you"
            name={yourHandle}
            queueMonogram={yourMonogram}
            videoTrack={localVideoTrack}
            hasVideo={videoEnabled}
            displayOffer={displayMyOffer}
            isTyping={false}
            phase={phase}
            isReady={myReady}
            score={isP1 ? myScore : oppScore}
            isSearching={false}
            queueTimedOut={queueTimedOut}
          />

          {(phase === "queued" || phase === "negotiating") && !queueTimedOut && (
            <BetControls
              phaseMode={phase === "queued" ? "queued" : "negotiating"}
              myOffer={myOfferStr}
              balance={balance}
              onOfferChange={onOfferChange}
              onQuickBet={setQuickBet}
              onMaxBet={setMaxBet}
              displayMyOffer={displayMyOffer}
              displayOppOffer={displayOppOffer}
              timeLeft={timeLeft}
            />
          )}

          {/* Ready button during live */}
          {phase === "live" && !myReady && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => { setMyReady(true); setOppReady(true); }}
              className="w-full py-4 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-base shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
            >
              ⚔️ Begin AI Judgment
            </motion.button>
          )}

          {phase === "live" && myReady && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={startAnalysis}
              className="w-full py-4 bg-red-600 text-white font-black uppercase tracking-widest text-base shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
            >
              <span className="flex items-center justify-center gap-2">
                <Swords className="size-5" /> SCAN FACES
              </span>
            </motion.button>
          )}

          {/* Your metrics during analysis (desktop: below your panel) */}
          {showAnalysis && (
            <div className="hidden md:block">
              <MetricsList metrics={METRICS} metricScores={metricScores} revealedMetrics={revealedMetrics} side="p1" isP1={isP1} />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isQueued && queueTimedOut && (
          <MatchmakingTimeoutOverlay
            onTryAgain={() => {
              timedOutBattleRef.current = false;
              setQueueTimedOut(false);
              onQueue();
            }}
            onBackToArena={backToArenaLanding}
          />
        )}
      </AnimatePresence>

      {/* Done overlay */}
      <AnimatePresence>
        {isDone && (
          <DoneOverlay
            iWon={iWon}
            betAmount={match?.bet_amount ?? 0}
            myScore={isP1 ? myScore : oppScore}
            oppScore={isP1 ? oppScore : myScore}
            onRematch={resetArena}
            onDashboard={() => router.push("/dashboard")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────

function IdleScreen({
  onQueue,
  isPending,
  balance,
}: {
  onQueue: () => void;
  isPending: boolean;
  balance: number;
}) {
  return (
    <div className="w-full flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-8 px-4">
      {/* Neon title */}
      <div className="text-center space-y-3">
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-xs font-black uppercase tracking-[0.4em] text-cyan-400"
        >
          ◈ OMOGGER ARENA ◈
        </motion.div>
        <h1
          className="text-6xl md:text-8xl font-black uppercase text-white leading-none"
          style={{
            textShadow: "0 0 40px rgba(168,85,247,0.8), 0 0 80px rgba(168,85,247,0.4)",
            fontFamily: "var(--font-ibm-plex-mono)",
          }}
        >
          ENTER
          <br />
          <span className="text-fuchsia-400">ARENA</span>
        </h1>
        <p className="text-zinc-500 text-sm uppercase tracking-widest">
          1v1 · Bet · Mog or be mogged
        </p>
      </div>

      {/* Balance */}
      <div className="flex items-center gap-2 border border-fuchsia-500/30 bg-fuchsia-500/5 px-5 py-2.5">
        <Zap className="size-4 text-fuchsia-400" />
        <span className="font-black text-white tabular-nums" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
          {balance.toLocaleString()}
        </span>
        <span className="text-xs text-zinc-500 uppercase font-bold">Mog Coins</span>
      </div>

      {/* Enter button */}
      <motion.button
        onClick={onQueue}
        disabled={isPending || balance < 1}
        whileTap={{ scale: 0.97 }}
        className="group relative flex items-center justify-center gap-3 w-72 h-16 bg-fuchsia-500 text-black font-black text-lg uppercase tracking-widest shadow-[6px_6px_0_#fff] hover:shadow-none hover:translate-x-1.5 hover:translate-y-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
      >
        {isPending ? (
          <><Loader2 className="size-5 animate-spin" /> Connecting…</>
        ) : (
          <><Swords className="size-5" /> Fight</>
        )}
      </motion.button>

      {balance < 1 && (
        <p className="text-xs text-red-400 uppercase tracking-widest">
          Need Mog Coins to enter →{" "}
          <a href="/wallet" className="underline text-red-300">Deposit</a>
        </p>
      )}

      {/* Aesthetic grid lines */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#a855f7 1px, transparent 1px), linear-gradient(90deg, #a855f7 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

function ArenaTopBar({ balance }: { balance: number }) {
  return (
    <div className="relative z-10 flex items-center justify-between border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3">
      <motion.span
        className="text-lg md:text-xl font-black tracking-tight text-white uppercase"
        style={{
          fontFamily: "var(--font-ibm-plex-mono)",
          textShadow: "0 0 24px rgba(168,85,247,0.9), 0 0 48px rgba(236,72,153,0.35)",
        }}
      >
        MOGBATTLE
      </motion.span>
      <div
        className="flex items-center gap-2 rounded-none border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1.5"
        style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
      >
        <span className="text-base" aria-hidden>
          💰
        </span>
        <span className="font-black tabular-nums text-white text-sm md:text-base">{balance.toLocaleString()}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-pink-300/90">MOGCOINS</span>
      </div>
    </div>
  );
}

function GlowingVS({ large = false }: { large?: boolean }) {
  return (
    <motion.div
      animate={{
        textShadow: [
          "0 0 20px rgba(168,85,247,0.9), 0 0 40px rgba(6,182,212,0.6)",
          "0 0 32px rgba(236,72,153,1), 0 0 64px rgba(168,85,247,0.5)",
          "0 0 20px rgba(168,85,247,0.9), 0 0 40px rgba(6,182,212,0.6)",
        ],
      }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      className={`font-black text-white select-none ${large ? "text-6xl sm:text-7xl md:text-8xl" : "text-5xl md:text-6xl"}`}
      style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
    >
      VS
    </motion.div>
  );
}

function MatchmakingTimeoutOverlay({
  onTryAgain,
  onBackToArena,
}: {
  onTryAgain: () => void;
  onBackToArena: () => void | Promise<void>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md px-4"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className="w-full max-w-md border-2 border-red-500/50 bg-zinc-950/95 p-8 text-center space-y-5"
        style={{ boxShadow: "0 0 60px rgba(239,68,68,0.25), inset 0 0 40px rgba(168,85,247,0.06)" }}
      >
        <div className="space-y-2">
          <h2
            className="text-3xl md:text-5xl font-black uppercase text-red-300 leading-tight"
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              textShadow: "0 0 28px rgba(248,113,113,0.5)",
            }}
          >
            No opponent found
          </h2>
          <p className="text-sm text-zinc-500 uppercase tracking-widest">Please try again later</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onTryAgain}
            className="py-3.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            TRY AGAIN
          </button>
          <button
            type="button"
            onClick={() => void onBackToArena()}
            className="py-3.5 border border-cyan-500/50 bg-cyan-500/5 text-cyan-300 font-black uppercase tracking-widest text-sm hover:bg-cyan-500/15 transition-colors"
          >
            BACK TO ARENA
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Player Panel ─────────────────────────────────────────────────────────────

function PlayerPanel({
  side,
  name,
  footerOverride,
  queueMonogram,
  videoTrack,
  hasVideo,
  displayOffer,
  isTyping,
  phase,
  isReady,
  score,
  isSearching = false,
  queueTimedOut = false,
}: {
  side: "you" | "opponent";
  name: string;
  footerOverride?: string | null;
  queueMonogram?: string;
  videoTrack: ICameraVideoTrack | IRemoteVideoTrack | null;
  hasVideo: boolean;
  displayOffer: string;
  isTyping: boolean;
  phase: ArenaPhase;
  isReady: boolean;
  score: number | null;
  isSearching?: boolean;
  queueTimedOut?: boolean;
}) {
  const videoRef = useRef<HTMLDivElement>(null);
  const isYou = side === "you";
  const accentCss = isYou
    ? {
        border: "border-fuchsia-500",
        glow: "shadow-[0_0_40px_rgba(217,70,239,0.5)]",
        text: "text-fuchsia-300",
        bg: "bg-fuchsia-500/10",
      }
    : {
        border: "border-cyan-400",
        glow: "shadow-[0_0_40px_rgba(34,211,238,0.45)]",
        text: "text-cyan-300",
        bg: "bg-cyan-500/10",
      };
  const footerText = footerOverride ?? name;
  const circleLetters = queueMonogram ?? name.slice(0, 2);

  useEffect(() => {
    if (!videoTrack || !videoRef.current) return;
    (videoTrack as ICameraVideoTrack).play(videoRef.current);
    return () => { try { (videoTrack as ICameraVideoTrack).stop(); } catch {} };
  }, [videoTrack]);

  const showVideo = hasVideo && videoTrack;
  const showScore = score !== null && ["verdict", "done"].includes(phase);

  const heroPhases = ["queued", "negotiating", "live", "countdown", "analyzing", "verdict", "done"] as const;
  const showHeroNumber = heroPhases.includes(phase as (typeof heroPhases)[number]);

  const heroValue =
    isYou
      ? displayOffer || (phase === "queued" || phase === "negotiating" ? "" : "")
      : isSearching && !queueTimedOut
        ? "—"
        : displayOffer || (phase === "negotiating" ? "—" : "");

  const heroKey = isYou ? (displayOffer || "empty") : `${isSearching}-${displayOffer || "dash"}`;

  return (
    <div className={`relative flex flex-col border-2 ${accentCss.border} ${accentCss.glow} bg-black/90 overflow-hidden`}>
      {/* Giant bet / input readout — above video */}
      {showHeroNumber && (
        <div className="relative z-[1] border-b border-white/10 bg-gradient-to-b from-zinc-950 to-black px-2 py-3 md:py-4">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={heroKey}
              initial={{ scale: 0.88, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 28 }}
              className="flex items-baseline justify-center gap-1"
            >
              <span
                className={`font-black tabular-nums tracking-tighter ${accentCss.text} ${!heroValue && isYou ? "opacity-40" : ""}`}
                style={{
                  fontFamily: "var(--font-ibm-plex-mono)",
                  fontSize: "clamp(2.25rem, 8vw, 4rem)",
                  lineHeight: 1,
                  textShadow: isYou
                    ? "0 0 28px rgba(168,85,247,0.85), 0 0 56px rgba(236,72,153,0.35)"
                    : "0 0 28px rgba(6,182,212,0.85), 0 0 48px rgba(168,85,247,0.25)",
                }}
              >
                {heroValue || (isYou ? "0" : "—")}
              </span>
              {(phase === "queued" || phase === "negotiating" || !!displayOffer) && (
                <span className={`text-sm font-black uppercase ${accentCss.text} opacity-50`}>MC</span>
              )}
            </motion.div>
          </AnimatePresence>
          {isYou && (phase === "queued" || phase === "negotiating") && (
            <p className="text-center text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-pink-400 mt-2">
              Type digits - locked to your balance
            </p>
          )}
        </div>
      )}

      <div className="relative aspect-[4/3] md:aspect-video bg-zinc-950">
        <div
          ref={videoRef}
          className="absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
        />

        {!showVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-zinc-950 to-black">
            {isSearching && !queueTimedOut ? (
              <div className="flex flex-col items-center gap-4 px-4 text-center">
                {!isYou && (
                  <motion.p
                    animate={{ opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className="text-xs sm:text-sm font-black uppercase tracking-[0.35em] text-cyan-200"
                  >
                    WAITING FOR OPPONENT...
                  </motion.p>
                )}
                <motion.div
                  animate={{ opacity: [0.65, 1, 0.65] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className={`relative w-28 h-36 md:w-32 md:h-40 border-2 ${accentCss.border} ${accentCss.bg} flex items-center justify-center`}
                  style={{
                    clipPath: "polygon(15% 0%, 85% 0%, 100% 12%, 100% 88%, 85% 100%, 15% 100%, 0% 88%, 0% 12%)",
                  }}
                >
                  <div className={`text-4xl opacity-25 ${accentCss.text}`}>▮</div>
                </motion.div>
                {isYou && isSearching && (
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">Your cam loads after match</p>
                )}
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className={`size-1.5 rounded-full ${isYou ? "bg-fuchsia-500" : "bg-cyan-400"}`}
                      animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <motion.div
                  animate={phase === "queued" && isYou ? { boxShadow: ["0 0 20px rgba(217,70,239,0.35)", "0 0 36px rgba(217,70,239,0.65)", "0 0 20px rgba(217,70,239,0.35)"] } : {}}
                  transition={{ duration: 2.5, repeat: phase === "queued" && isYou ? Infinity : 0 }}
                  className={`size-28 md:size-32 border-2 ${accentCss.border} ${accentCss.bg} flex items-center justify-center rounded-full`}
                >
                  <span className={`text-xl md:text-2xl font-black uppercase ${accentCss.text}`} style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
                    {circleLetters}
                  </span>
                </motion.div>
                {phase === "queued" && isYou && (
                  <p className="text-[10px] sm:text-xs text-fuchsia-300 font-black uppercase tracking-[0.28em] px-4 text-center">
                    In queue — warm up your bet
                  </p>
                )}
                {phase === "negotiating" && (
                  <p className="text-xs text-zinc-600 uppercase tracking-widest px-4 text-center">
                    Video channel opens when bet locks
                  </p>
                )}
                {phase === "live" && !videoTrack && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <WifiOff className="size-3.5" />
                    <span>Connecting camera…</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {showVideo && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/70 px-2 py-0.5">
            <motion.span
              className="size-1.5 rounded-full bg-red-500"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-xs font-mono text-red-400 font-bold">LIVE</span>
          </div>
        )}

        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 border border-cyan-500/50 bg-black/80 px-3 py-1"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-cyan-400"
                  animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
              <span className="text-xs text-cyan-400 font-mono ml-1">typing…</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showScore && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute inset-0 flex items-center justify-center bg-black/60 z-20"
            >
              <div className="text-center">
                <p className="text-xs uppercase tracking-widest text-zinc-400 mb-1">MOG SCORE</p>
                <p
                  className={`text-5xl font-black tabular-nums ${accentCss.text}`}
                  style={{
                    fontFamily: "var(--font-ibm-plex-mono)",
                    textShadow: isYou
                      ? "0 0 20px rgba(168,85,247,0.8)"
                      : "0 0 20px rgba(6,182,212,0.8)",
                  }}
                >
                  {score?.toFixed(1)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`flex items-center justify-between px-3 py-2 border-t ${accentCss.border} bg-black`}>
        <span
          className={`text-[10px] sm:text-xs font-black uppercase tracking-widest truncate max-w-[85%] ${accentCss.text}`}
          style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
        >
          {footerText}
        </span>
        {isReady && phase !== "idle" && (
          <span className="flex items-center gap-1 text-xs text-green-400 font-bold">
            <CheckCircle2 className="size-3" /> Ready
          </span>
        )}
        {!isReady && phase === "live" && (
          <span className="flex items-center gap-1 text-xs text-zinc-600">
            <Wifi className="size-3" /> Waiting…
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Center Column ────────────────────────────────────────────────────────────

function CenterColumn({
  phase,
  countdown,
  match,
  timeLeft,
  metricScores,
  revealedMetrics,
  isP1,
}: {
  phase: ArenaPhase;
  countdown: number;
  match: MatchRow | null;
  timeLeft: number;
  metricScores: { p1: number; p2: number }[];
  revealedMetrics: number[];
  isP1: boolean;
}) {
  const p1Offer = match?.player1_bet_offer ?? null;
  const p2Offer = match?.player2_bet_offer ?? null;
  const bothOffered = p1Offer !== null && p2Offer !== null;
  const offersMatch = bothOffered && p1Offer === p2Offer;

  return (
    <div className="flex flex-col items-center justify-start gap-4 pt-2 w-full">
      {/* Queued: searching pulse */}
      {phase === "queued" && (
        <div className="flex flex-col items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="size-1.5 rounded-full bg-fuchsia-500"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      )}

      {/* Negotiating: bet status */}
      {phase === "negotiating" && (
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="w-px flex-1 bg-gradient-to-b from-transparent via-fuchsia-500/30 to-transparent" style={{ height: 40 }} />
          {offersMatch ? (
            <div className="border border-green-500/50 bg-green-500/10 px-3 py-2 text-center">
              <p className="text-xs text-green-400 font-black uppercase">AGREED</p>
              <p className="text-lg font-black text-green-300 tabular-nums">{p1Offer} MC</p>
            </div>
          ) : bothOffered ? (
            <div className="border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-center">
              <p className="text-xs text-yellow-500 font-black uppercase">Mismatch</p>
            </div>
          ) : (
            <div className="border border-zinc-800 px-3 py-2 text-center">
              <Flame className="size-4 text-orange-400 mx-auto mb-1" />
              <p className="text-xs text-zinc-600 uppercase tracking-widest">Bet</p>
            </div>
          )}

          {/* Timer bar */}
          <div className="w-full space-y-1">
            <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
              <motion.div
                className={`h-full ${timeLeft <= 3 ? "bg-red-500" : "bg-fuchsia-500"}`}
                animate={{ width: `${(timeLeft / 10) * 100}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Countdown */}
      {phase === "countdown" && (
        <AnimatePresence mode="wait">
          <motion.div
            key={countdown}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="text-6xl font-black text-fuchsia-300"
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              textShadow: "0 0 30px rgba(168,85,247,1)",
            }}
          >
            {countdown}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Analysis: metric bars (desktop: center column) */}
      {["analyzing", "verdict"].includes(phase) && (
        <div className="w-full">
          <MetricsList
            metrics={METRICS}
            metricScores={metricScores}
            revealedMetrics={revealedMetrics}
            side="both"
            isP1={isP1}
          />
        </div>
      )}

      {/* Decorative line */}
      <div className="w-px flex-1 bg-gradient-to-b from-fuchsia-500/20 to-transparent" />
    </div>
  );
}

// ─── Bet Controls ─────────────────────────────────────────────────────────────

function BetControls({
  phaseMode,
  myOffer,
  balance,
  onOfferChange,
  onQuickBet,
  onMaxBet,
  displayMyOffer,
  displayOppOffer,
  timeLeft,
}: {
  phaseMode: "queued" | "negotiating";
  myOffer: string;
  balance: number;
  onOfferChange: (val: string) => void;
  onQuickBet: (n: number) => void;
  onMaxBet: () => void;
  displayMyOffer: string;
  displayOppOffer: string;
  timeLeft: number;
}) {
  const myNum = parseInt(displayMyOffer, 10) || 0;
  const oppNum = parseInt(displayOppOffer, 10) || 0;
  const overBalance = myNum > balance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-2 border-fuchsia-500/40 bg-black/95 p-4 space-y-3 md:max-w-lg md:ml-auto shadow-[0_0_32px_rgba(168,85,247,0.15)]"
    >
      <p
        className="text-center text-xl sm:text-2xl font-black uppercase tracking-tight text-white"
        style={{
          fontFamily: "var(--font-ibm-plex-mono)",
          textShadow: "0 0 18px rgba(34,211,238,0.45)",
        }}
      >
        Current bet: {myNum} MC
      </p>

      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-fuchsia-400 text-center">Your bet</p>

      {phaseMode === "negotiating" ? (
        <p
          className={`text-center text-xs font-black tabular-nums ${timeLeft <= 3 ? "text-red-400" : "text-yellow-400"}`}
          style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
        >
          Lock bet in · {timeLeft}s
        </p>
      ) : (
        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Offer sends to server once matched
        </p>
      )}

      {/* Input */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={myOffer}
        onChange={(e) => onOfferChange(e.target.value)}
        placeholder="0"
        className="w-full border border-fuchsia-500/40 bg-zinc-950 px-3 py-3 text-center text-2xl font-black text-white placeholder-zinc-800 focus:border-fuchsia-400 focus:outline-none tabular-nums"
        style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
      />

      {overBalance && (
        <p className="text-xs text-red-400 text-center font-bold">⚠ Exceeds balance ({balance} MC)</p>
      )}

      {/* Quick bets — 1 MC • 5 MC • 10 MC */}
      <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
        {[1, 5, 10].map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && <span className="text-fuchsia-500 font-black px-0.5 select-none">•</span>}
            <button
              type="button"
              onClick={() => onQuickBet(n)}
              disabled={balance < n}
              className="border border-zinc-700 bg-zinc-900 hover:border-fuchsia-500/60 hover:bg-fuchsia-500/15 px-3 py-2 text-[11px] font-black uppercase text-zinc-200 transition-colors disabled:opacity-30"
            >
              {n} MC
            </button>
          </span>
        ))}
      </div>

      {/* Max bet */}
      <button
        type="button"
        onClick={onMaxBet}
        disabled={balance < 1}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-black uppercase tracking-[0.2em] text-sm transition-all shadow-[4px_4px_0_rgba(250,204,21,0.45)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-30 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
      >
        Max bet · {balance} MC
      </button>

      {/* Offer hint */}
      {displayOppOffer && oppNum > 0 && (
        <p className="text-xs text-center text-cyan-400 font-mono">
          Opponent offered: <span className="font-black">{displayOppOffer} MC</span>
          {myNum === oppNum && myNum > 0 && (
            <span className="ml-2 text-green-400 font-black">✓ MATCH!</span>
          )}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-fuchsia-500/20 pt-3 mt-1">
        <span className="text-xs text-zinc-500 uppercase font-black tracking-widest">Your balance</span>
        <span className="text-base font-black tabular-nums text-cyan-300" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
          {balance.toLocaleString()} MC
        </span>
      </div>

      <p className="text-[10px] text-center text-zinc-600 uppercase tracking-widest">
        Keyboard digits · capped at balance
      </p>
    </motion.div>
  );
}

// ─── Metric List ──────────────────────────────────────────────────────────────

function MetricsList({
  metrics,
  metricScores,
  revealedMetrics,
  side,
  isP1,
}: {
  metrics: string[];
  metricScores: { p1: number; p2: number }[];
  revealedMetrics: number[];
  side: "p1" | "p2" | "both";
  isP1: boolean;
}) {
  return (
    <div className="border border-zinc-800 bg-black overflow-hidden">
      <div className="border-b border-zinc-800 px-3 py-2">
        <p className="text-xs font-black uppercase tracking-widest text-fuchsia-400">AI Analysis</p>
      </div>
      <div className="divide-y divide-zinc-900">
        {metrics.map((metric, i) => {
          const revealed = revealedMetrics.includes(i);
          const scores = metricScores[i];
          if (!revealed || !scores) {
            return (
              <div key={metric} className="px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-zinc-700 flex-1">{metric}</span>
                <div className="size-1.5 rounded-full bg-zinc-800 animate-pulse" />
              </div>
            );
          }
          const myS = isP1 ? scores.p1 : scores.p2;
          const showScore = side === "both" ? true : side === "p1" ? true : true;
          return (
            <motion.div
              key={metric}
              initial={{ opacity: 0, x: side === "p2" ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="px-3 py-1.5 flex items-center gap-2"
            >
              <span className="text-xs text-zinc-500 w-24 shrink-0">{metric}</span>
              {showScore && (
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-xs font-mono text-fuchsia-300 w-8 text-right tabular-nums">
                    {myS.toFixed(0)}
                  </span>
                  <div className="flex-1 h-1 bg-zinc-900 overflow-hidden">
                    <motion.div
                      className="h-full bg-fuchsia-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${myS}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
              <CheckCircle2 className="size-3 text-green-500 shrink-0" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Done Overlay ─────────────────────────────────────────────────────────────

function Particle({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <motion.div
      className="absolute size-2 rounded-full"
      style={{ backgroundColor: color, left: "50%", top: "40%" }}
      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
      animate={{ x, y, opacity: 0, scale: 0 }}
      transition={{ duration: 1.2 + Math.random() * 0.8, ease: "easeOut" }}
    />
  );
}

function DoneOverlay({
  iWon,
  betAmount,
  myScore,
  oppScore,
  onRematch,
  onDashboard,
}: {
  iWon: boolean;
  betAmount: number;
  myScore: number | null;
  oppScore: number | null;
  onRematch: () => void;
  onDashboard: () => void;
}) {
  const particles = iWon
    ? Array.from({ length: 24 }, (_, i) => ({
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.7) * 500,
        color: ["#a855f7", "#22d3ee", "#f59e0b", "#ec4899", "#10b981"][i % 5],
      }))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm px-4"
    >
      {/* Confetti */}
      {particles.map((p, i) => (
        <Particle key={i} x={p.x} y={p.y} color={p.color} />
      ))}

      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 20, delay: 0.1 }}
        className={`relative w-full max-w-sm border-2 ${iWon ? "border-fuchsia-500" : "border-red-500"} bg-black p-6 space-y-5 text-center`}
        style={{
          boxShadow: iWon
            ? "0 0 60px rgba(168,85,247,0.5), 0 0 120px rgba(168,85,247,0.2)"
            : "0 0 60px rgba(239,68,68,0.4)",
        }}
      >
        {/* Corner accents */}
        <div className={`absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 ${iWon ? "border-cyan-400" : "border-red-400"}`} />
        <div className={`absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 ${iWon ? "border-cyan-400" : "border-red-400"}`} />

        {/* Icon */}
        <div className="flex justify-center">
          {iWon ? (
            <motion.div
              animate={{ rotate: [0, -5, 5, -5, 0] }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Trophy className="size-14 text-yellow-400" style={{ filter: "drop-shadow(0 0 16px rgba(251,191,36,0.8))" }} />
            </motion.div>
          ) : (
            <Skull className="size-14 text-red-400" />
          )}
        </div>

        {/* Title */}
        <div>
          <motion.h2
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`text-4xl font-black uppercase tracking-tight ${iWon ? "text-fuchsia-200" : "text-red-300"}`}
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              textShadow: iWon ? "0 0 30px rgba(168,85,247,0.8)" : "0 0 20px rgba(239,68,68,0.6)",
            }}
          >
            {iWon ? "YOU MOGGED" : "MOGGED"}
          </motion.h2>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">
            {iWon ? "Facial superiority confirmed by AI" : "The numbers don't lie, king"}
          </p>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`border ${iWon ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-zinc-800"} p-3`}>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">YOU</p>
            <p
              className={`text-3xl font-black tabular-nums ${iWon ? "text-fuchsia-300" : "text-zinc-400"}`}
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            >
              {myScore?.toFixed(1) ?? "—"}
            </p>
            {iWon && <p className="text-xs text-fuchsia-400 font-black mt-0.5">WINNER</p>}
          </div>
          <div className={`border ${!iWon ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-zinc-800"} p-3`}>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">OPP</p>
            <p
              className={`text-3xl font-black tabular-nums ${!iWon ? "text-fuchsia-300" : "text-zinc-400"}`}
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            >
              {oppScore?.toFixed(1) ?? "—"}
            </p>
            {!iWon && <p className="text-xs text-fuchsia-400 font-black mt-0.5">WINNER</p>}
          </div>
        </div>

        {/* P&L */}
        {betAmount > 0 && (
          <div
            className={`border px-4 py-3 ${iWon ? "border-green-500/30 bg-green-500/10" : "border-red-500/20 bg-red-500/10"}`}
          >
            <p
              className={`text-3xl font-black tabular-nums ${iWon ? "text-green-300" : "text-red-400"}`}
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            >
              {iWon ? `+${(betAmount * 2).toLocaleString()}` : `-${betAmount.toLocaleString()}`} MC
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {iWon ? "Deposited to your balance" : "Taken by winner"}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onRematch}
            className="py-3 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-sm shadow-[3px_3px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            Rematch
          </button>
          <button
            onClick={onDashboard}
            className="py-3 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-black uppercase tracking-widest text-sm transition-colors"
          >
            Dashboard
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
