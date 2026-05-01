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
  Timer,
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

// ─── Main export ─────────────────────────────────────────────────────────────

export function ArenaClient({
  initialBalance,
  initialMatch,
  initialOpponentName,
  userId,
}: {
  initialBalance: number;
  initialMatch: MatchRow | null;
  initialOpponentName: string | null;
  userId: string;
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
  const [oppTyping, setOppTyping] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [oppReady, setOppReady] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [revealedMetrics, setRevealedMetrics] = useState<number[]>([]);
  const [metricScores, setMetricScores] = useState<{ p1: number; p2: number }[]>([]);
  const [scoreP1, setScoreP1] = useState<number | null>(initialMatch?.ai_score_p1 ?? null);
  const [scoreP2, setScoreP2] = useState<number | null>(initialMatch?.ai_score_p2 ?? null);

  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOppOffer = useRef<number | null>(null);
  const analysisRunning = useRef(false);

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
      return derivePhase(newMatch);
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
    if (phase !== "queued") { setQueueSecs(0); return; }
    const t = setInterval(() => setQueueSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Keyboard number input during negotiation
  useEffect(() => {
    if (phase !== "negotiating") return;
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
  }, [phase, match?.id, balance]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function scheduleOfferSubmit(val: string) {
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    const amount = parseInt(val, 10);
    if (!amount || amount < 1 || !match?.id) return;
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
    setIsPending(true);
    startTransition(async () => {
      const token = await getAccessToken();
      if (!token) { setIsPending(false); return; }
      await queueForBattle(token);
      setPhase("queued");
      await poll();
      setIsPending(false);
    });
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

  if (phase === "queued") {
    return <QueueScreen queueSecs={queueSecs} balance={balance} />;
  }

  const showAnalysis = ["analyzing", "verdict"].includes(phase);
  const isDone = phase === "done";

  return (
    <div className="relative w-full flex flex-col gap-2 pb-4" style={{ minHeight: "calc(100dvh - 3.5rem)" }}>
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Top bar */}
      <TopBar
        phase={phase}
        timeLeft={timeLeft}
        balance={balance}
        betAmount={match?.bet_amount ?? 0}
        opponentName={opponentName}
      />

      {/* Split screen */}
      <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[1fr_120px_1fr] gap-2 px-1 md:px-0">
        {/* LEFT — Opponent */}
        <div className="flex flex-col gap-2">
          <PlayerPanel
            side="opponent"
            name={opponentName ?? "???"}
            videoTrack={remoteVideoTrack}
            hasVideo={videoEnabled}
            displayOffer={displayOppOffer}
            isTyping={oppTyping}
            phase={phase}
            isReady={oppReady}
            score={isP1 ? oppScore : myScore}
          />
          {/* Opponent metrics during analysis (mobile: below their panel) */}
          {showAnalysis && (
            <div className="md:hidden">
              <MetricsList metrics={METRICS} metricScores={metricScores} revealedMetrics={revealedMetrics} side="p2" isP1={isP1} />
            </div>
          )}
        </div>

        {/* CENTER */}
        <CenterColumn
          phase={phase}
          countdown={countdown}
          match={match}
          timeLeft={timeLeft}
          metricScores={metricScores}
          revealedMetrics={revealedMetrics}
          isP1={isP1}
        />

        {/* RIGHT — You */}
        <div className="flex flex-col gap-2">
          <PlayerPanel
            side="you"
            name="YOU"
            videoTrack={localVideoTrack}
            hasVideo={videoEnabled}
            displayOffer={displayMyOffer}
            isTyping={false}
            phase={phase}
            isReady={myReady}
            score={isP1 ? myScore : oppScore}
          />

          {/* Your controls during negotiation */}
          {phase === "negotiating" && (
            <BetControls
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
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-8 px-4">
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

// ─── Queue Screen ─────────────────────────────────────────────────────────────

function QueueScreen({ queueSecs, balance }: { queueSecs: number; balance: number }) {
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-6">
        <div className="relative mx-auto size-32">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 border-2 border-fuchsia-500"
              animate={{ scale: [1, 1.8 + i * 0.4], opacity: [0.8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
            />
          ))}
          <div className="relative size-full border-2 border-fuchsia-500 bg-fuchsia-500/10 flex items-center justify-center">
            <Swords className="size-12 text-fuchsia-300" />
          </div>
        </div>
        <div>
          <p
            className="text-3xl font-black text-white uppercase tracking-wide"
            style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
          >
            Hunting prey…
          </p>
          <p className="mt-2 text-cyan-400 font-mono tabular-nums text-lg">{queueSecs}s</p>
          <p className="mt-1 text-zinc-600 text-xs uppercase tracking-widest">Scanning arena for opponent</p>
        </div>
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="size-2 bg-fuchsia-500"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-4 py-2">
        <Zap className="size-3.5 text-fuchsia-400" />
        <span className="text-sm font-black text-white tabular-nums">{balance.toLocaleString()}</span>
        <span className="text-xs text-zinc-600 uppercase">MC</span>
      </div>
    </div>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({
  phase,
  timeLeft,
  balance,
  betAmount,
  opponentName,
}: {
  phase: ArenaPhase;
  timeLeft: number;
  balance: number;
  betAmount: number;
  opponentName: string | null;
}) {
  const phaseLabel: Record<ArenaPhase, string> = {
    idle: "LOBBY",
    queued: "SEARCHING",
    negotiating: "NEGOTIATE BET",
    live: "LIVE · FACE SCAN READY",
    countdown: "AI INITIALIZING",
    analyzing: "ANALYZING FACES",
    verdict: "COMPUTING VERDICT",
    done: "BATTLE COMPLETE",
  };

  const isNeg = phase === "negotiating";

  return (
    <div className="relative z-10 flex items-center justify-between border-b border-white/10 bg-black/80 backdrop-blur px-3 py-2 md:px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <motion.span
            className="size-2 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-xs font-black uppercase tracking-widest text-zinc-400">{phaseLabel[phase]}</span>
        </div>
        {opponentName && (
          <span className="hidden sm:block text-xs text-zinc-600 font-mono">vs {opponentName}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isNeg && (
          <div className={`flex items-center gap-1.5 border px-3 py-1 ${timeLeft <= 3 ? "border-red-500/60 bg-red-500/10" : "border-yellow-500/40 bg-yellow-500/5"}`}>
            <Timer className={`size-3.5 ${timeLeft <= 3 ? "text-red-400" : "text-yellow-400"}`} />
            <span className={`font-black tabular-nums text-sm ${timeLeft <= 3 ? "text-red-300" : "text-yellow-300"}`} style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
              {timeLeft}s
            </span>
          </div>
        )}
        {betAmount > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 border border-orange-500/40 bg-orange-500/5 px-3 py-1">
            <Flame className="size-3.5 text-orange-400" />
            <span className="font-black text-orange-300 text-sm tabular-nums">{betAmount} MC</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-1">
          <Zap className="size-3.5 text-fuchsia-400" />
          <span className="font-black text-white text-sm tabular-nums" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
            {balance.toLocaleString()}
          </span>
          <span className="text-xs text-zinc-600 uppercase font-bold">MC</span>
        </div>
      </div>
    </div>
  );
}

// ─── Player Panel ─────────────────────────────────────────────────────────────

function PlayerPanel({
  side,
  name,
  videoTrack,
  hasVideo,
  displayOffer,
  isTyping,
  phase,
  isReady,
  score,
}: {
  side: "you" | "opponent";
  name: string;
  videoTrack: ICameraVideoTrack | IRemoteVideoTrack | null;
  hasVideo: boolean;
  displayOffer: string;
  isTyping: boolean;
  phase: ArenaPhase;
  isReady: boolean;
  score: number | null;
}) {
  const videoRef = useRef<HTMLDivElement>(null);
  const isYou = side === "you";
  const accent = isYou ? "fuchsia" : "cyan";
  const accentCss = isYou
    ? { border: "border-fuchsia-500", glow: "shadow-[0_0_30px_rgba(168,85,247,0.4)]", text: "text-fuchsia-300", bg: "bg-fuchsia-500/10" }
    : { border: "border-cyan-500", glow: "shadow-[0_0_30px_rgba(6,182,212,0.4)]", text: "text-cyan-300", bg: "bg-cyan-500/10" };

  useEffect(() => {
    if (!videoTrack || !videoRef.current) return;
    (videoTrack as ICameraVideoTrack).play(videoRef.current);
    return () => { try { (videoTrack as ICameraVideoTrack).stop(); } catch {} };
  }, [videoTrack]);

  const showVideo = hasVideo && videoTrack;
  const showOffer = displayOffer && ["negotiating", "live", "countdown", "analyzing", "verdict", "done"].includes(phase);
  const showScore = score !== null && ["verdict", "done"].includes(phase);

  return (
    <div className={`relative flex flex-col border ${accentCss.border} ${accentCss.glow} bg-black overflow-hidden`}>
      {/* Video feed */}
      <div className="relative aspect-[4/3] md:aspect-video bg-zinc-950">
        {/* Video container */}
        <div
          ref={videoRef}
          className="absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
        />

        {/* Placeholder */}
        {!showVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className={`size-16 border-2 ${accentCss.border} ${accentCss.bg} flex items-center justify-center`}>
              <span className={`text-xs font-black uppercase ${accentCss.text}`}>{name.slice(0, 3)}</span>
            </div>
            {phase === "negotiating" && (
              <p className="text-xs text-zinc-600 uppercase tracking-widest px-4 text-center">
                Camera starts after bet agreed
              </p>
            )}
            {phase === "live" && !videoTrack && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                <WifiOff className="size-3.5" />
                <span>Connecting camera…</span>
              </div>
            )}
          </div>
        )}

        {/* LIVE badge */}
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

        {/* Typing indicator */}
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

        {/* Score overlay */}
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

      {/* Name bar */}
      <div className={`flex items-center justify-between px-3 py-2 border-t ${accentCss.border} bg-black`}>
        <span className={`text-xs font-black uppercase tracking-widest ${accentCss.text}`}>{name}</span>
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

      {/* Floating MOG number */}
      <AnimatePresence mode="popLayout">
        {showOffer && displayOffer && (
          <motion.div
            key={displayOffer}
            initial={{ scale: 0.6, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`absolute top-3 ${isYou ? "right-3" : "left-3"} z-20 pointer-events-none`}
          >
            <div
              className={`border ${accentCss.border} ${accentCss.bg} px-3 py-1.5`}
              style={{
                boxShadow: isYou
                  ? "0 0 20px rgba(168,85,247,0.6), inset 0 0 10px rgba(168,85,247,0.1)"
                  : "0 0 20px rgba(6,182,212,0.6), inset 0 0 10px rgba(6,182,212,0.1)",
              }}
            >
              <span
                className={`text-2xl font-black tabular-nums ${accentCss.text}`}
                style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
              >
                {displayOffer}
              </span>
              <span className={`text-xs ml-1 ${accentCss.text} opacity-60`}>MC</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="hidden md:flex flex-col items-center justify-start gap-4 pt-6">
      {/* VS */}
      <motion.div
        animate={{
          textShadow: [
            "0 0 20px rgba(168,85,247,0.8)",
            "0 0 40px rgba(168,85,247,1)",
            "0 0 20px rgba(168,85,247,0.8)",
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-3xl font-black text-white tracking-widest"
        style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
      >
        VS
      </motion.div>

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
  myOffer,
  balance,
  onOfferChange,
  onQuickBet,
  onMaxBet,
  displayMyOffer,
  displayOppOffer,
  timeLeft,
}: {
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
      className="border border-fuchsia-500/30 bg-black p-3 space-y-3"
    >
      <p className="text-xs font-black uppercase tracking-widest text-fuchsia-400">Your Bet</p>

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

      {/* Quick bets */}
      <div className="grid grid-cols-3 gap-1.5">
        {[1, 5, 10].map((n) => (
          <button
            key={n}
            onClick={() => onQuickBet(n)}
            disabled={balance < n}
            className="border border-zinc-700 bg-zinc-900 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10 py-2 text-xs font-black uppercase text-zinc-300 transition-colors disabled:opacity-30"
          >
            {n} MC
          </button>
        ))}
      </div>

      {/* Max bet */}
      <button
        onClick={onMaxBet}
        disabled={balance < 1}
        className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-sm transition-colors shadow-[3px_3px_0_rgba(255,100,0,0.5)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-30 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
      >
        🔥 MAX BET ({balance} MC)
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

      <p className="text-xs text-center text-zinc-600 uppercase tracking-widest">
        Type numbers on keyboard to bet fast
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
          const oppS = isP1 ? scores.p2 : scores.p1;
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
