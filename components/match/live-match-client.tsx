"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { finalizeFreeMatchResult, forfeitMatch, rematchSameOpponent } from "@/app/actions";
import { Loader2, CheckCircle2, Swords, Trophy, Skull, FlaskConical } from "lucide-react";
import { useAgoraVideo, LocalVideoBox, RemoteVideoBox, type VideoBoxHandle } from "@/components/match/agora-video";

const TIER_INFO: Record<string, { icon: string; label: string; color: string }> = {
  chad:     { icon: "🔥", label: "CHAD",     color: "#e879f9" },
  chadlite: { icon: "⚜",  label: "CHADLITE", color: "#22d3ee" },
  htn:      { icon: "★",  label: "HTN",       color: "#86efac" },
  mtn:      { icon: "◈",  label: "MTN",       color: "#d4d4d8" },
  ltn:      { icon: "🌙", label: "LTN",       color: "#a1a1aa" },
  sub5:     { icon: "💀", label: "SUB5",      color: "#f87171" },
};

function PslCard({
  psl, tier, dom, flaw, label,
}: {
  psl: number; tier?: string; dom?: string; flaw?: string;
  label: "YOUR SCAN" | "ENEMY SCAN";
}) {
  const t = tier ? TIER_INFO[tier] : null;
  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-md px-3 py-2.5 space-y-1.5 min-w-[130px] max-w-[160px] border border-white/[0.08] shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-zinc-400 leading-none mb-1">Overall Score</p>
          <p className="text-3xl font-black text-white tabular-nums leading-none" style={{ fontFamily: "var(--font-heading)", textShadow: "0 0 18px rgba(255,255,255,0.35)" }}>
            {psl.toFixed(1)}
          </p>
        </div>
        <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-zinc-500 text-right leading-tight mt-0.5 shrink-0">{label}</p>
      </div>
      {t && (
        <div className="flex items-center gap-1.5">
          <span className="text-sm leading-none">{t.icon}</span>
          <span className="text-[10px] font-black uppercase tracking-wider leading-none" style={{ color: t.color }}>{t.label}</span>
        </div>
      )}
      {(dom || flaw) && (
        <div className="space-y-0.5 pt-1 border-t border-white/[0.08]">
          {dom && dom !== "n/a" && (
            <div className="flex items-start gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-400 w-6 shrink-0 mt-px">DOM</span>
              <span className="text-[9px] text-zinc-200 leading-tight line-clamp-1">{dom}</span>
            </div>
          )}
          {flaw && flaw !== "none" && flaw !== "n/a" && (
            <div className="flex items-start gap-1.5">
              <span className="text-[8px] font-black uppercase text-red-400 w-6 shrink-0 mt-px">FLAW</span>
              <span className="text-[9px] text-red-300 leading-tight line-clamp-1">{flaw}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const METRICS = [
  "Jawline Definition",
  "Hunter Eye Angle",
  "Facial Harmony",
  "FWHR Ratio",
  "Canthal Tilt",
  "Bone Structure",
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "countdown" | "analyzing" | "verdict" | "done";

type Tier = "sub5" | "ltn" | "mtn" | "htn" | "chadlite" | "chad";
type AiResult = { psl: number; rating: number; tier?: Tier; verdict: string; failos?: string; strengths?: string; harm?: number; misc?: number; angu?: number; dimo?: number; weighted?: number; penalty?: number } | null;

const TIER_META: Record<Tier, { label: string; color: string; bg: string; border: string }> = {
  sub5:     { label: "SUB5",      color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/40" },
  ltn:      { label: "LTN",       color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/40" },
  mtn:      { label: "MTN",       color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/40" },
  htn:      { label: "HTN",       color: "text-lime-400",    bg: "bg-lime-500/10",    border: "border-lime-500/40" },
  chadlite: { label: "CHADLITE",  color: "text-cyan-300",    bg: "bg-cyan-500/10",    border: "border-cyan-500/40" },
  chad:     { label: "CHAD",      color: "text-yellow-300", bg: "bg-yellow-500/15", border: "border-yellow-500/60" },
};

async function judgeFace(imageDataUrl: string): Promise<AiResult> {
  try {
    const res = await fetch("/api/judge-face", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function LiveMatchClient({
  matchId,
  isPlayer1,
  initialStatus,
  winnerId,
  userId,
  opponentId,
  betAmount,
  isFreeMatch,
  initialAiP1,
  initialAiP2,
}: {
  matchId: string;
  isPlayer1: boolean;
  initialStatus: string;
  winnerId: string | null;
  userId: string;
  opponentId: string | null;
  betAmount: number;
  isFreeMatch: boolean;
  initialAiP1: number | null;
  initialAiP2: number | null;
}) {
  const isCompleted = initialStatus === "completed";

  // Keep RTC alive through the victory/defeat screen. This is local state so
  // router.refresh() (which updates initialStatus → "completed") does NOT flip
  // enabled to false — only explicit navigation via leaveChannel() does.
  const [rtcEnabled, setRtcEnabled] = useState(!isCompleted);

  const { localVideoTrack, remoteVideoTrack, opponentLeft, audioMuted, unlockAudio, mediaError, leaveChannel } = useAgoraVideo({
    channelName: matchId,
    uid: isPlayer1 ? 1 : 2,
    enabled: rtcEnabled,
  });

  const localVideoRef = useRef<VideoBoxHandle>(null);
  const remoteVideoRef = useRef<VideoBoxHandle>(null);

  const [myReady, setMyReady] = useState(isCompleted);
  const [oppReady, setOppReady] = useState(isCompleted);
  const [phase, setPhase] = useState<Phase>(isCompleted ? "done" : "idle");
  const [countdown, setCountdown] = useState(3);
  const [revealedMetrics, setRevealedMetrics] = useState<number[]>(isCompleted ? METRICS.map((_, i) => i) : []);
  const [metricScores, setMetricScores] = useState<{ p1: number; p2: number }[]>(
    isCompleted ? METRICS.map(() => ({ p1: 0, p2: 0 })) : []
  );
  const [scoreP1, setScoreP1] = useState<number | null>(initialAiP1);
  const [scoreP2, setScoreP2] = useState<number | null>(initialAiP2);
  const [myAiResult, setMyAiResult] = useState<AiResult>(null);
  const [oppAiResult, setOppAiResult] = useState<AiResult>(null);
  const [testMode, setTestMode] = useState(false);
  const [opponentAbandoned, setOpponentAbandoned] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { token: authToken } = useAuth();

  const iWon = winnerId
    ? winnerId === userId
    : scoreP1 !== null && scoreP2 !== null
      ? isPlayer1 ? scoreP1 >= scoreP2 : scoreP2 >= scoreP1
      : false;

  const myScore = isPlayer1 ? scoreP1 : scoreP2;
  const oppScore = isPlayer1 ? scoreP2 : scoreP1;

  const bothReady = myReady && oppReady;

  useEffect(() => {
    if (isCompleted && initialAiP1 !== null && initialAiP2 !== null) {
      setMetricScores(
        METRICS.map(() => ({
          p1: 70 + Math.random() * 30,
          p2: 70 + Math.random() * 30,
        }))
      );
    }
  }, [isCompleted, initialAiP1, initialAiP2]);

  useEffect(() => {
    // Guard: ignore if already finished — the game was decided before opponent left Agora.
    // We intentionally do NOT null remoteVideoTrack here so the video feed can linger
    // during the victory screen even if the opponent disconnects after the verdict.
    if (!opponentLeft || isCompleted || opponentAbandoned || phase === "done") return;
    setOpponentAbandoned(true);
    setPhase("done");
    setScoreP1(isPlayer1 ? 10 : 0);
    setScoreP2(isPlayer1 ? 0 : 10);
    startTransition(async () => {
      if (!authToken) return;
      await forfeitMatch(authToken, matchId);
      router.refresh();
    });
  }, [opponentLeft, isCompleted, opponentAbandoned, phase, isPlayer1, authToken, matchId, router]);

  async function startAnalysis(isTest = false) {
    setPhase("countdown");
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await delay(900);
    }

    setPhase("analyzing");
    setRevealedMetrics([]);
    setMetricScores([]);

    // Capture frames for AI judgment
    const myFrame = localVideoRef.current?.captureFrame() ?? null;
    const oppFrame = isTest ? myFrame : (remoteVideoRef.current?.captureFrame() ?? null);

    // Fire AI calls in parallel while metrics animate
    const [myResultPromise, oppResultPromise] = [
      myFrame ? judgeFace(myFrame) : Promise.resolve(null),
      oppFrame ? judgeFace(oppFrame) : Promise.resolve(null),
    ];

    const scores: { p1: number; p2: number }[] = [];
    for (let i = 0; i < METRICS.length; i++) {
      await delay(1800 + Math.random() * 800);
      const ms = { p1: 70 + Math.random() * 30, p2: 70 + Math.random() * 30 };
      scores.push(ms);
      setMetricScores([...scores]);
      setRevealedMetrics((prev) => [...prev, i]);
    }

    // Wait for AI results
    const [myResult, oppResult] = await Promise.all([myResultPromise, oppResultPromise]);
    setMyAiResult(myResult);
    setOppAiResult(oppResult);

    await delay(1200);
    setPhase("verdict");

    await delay(2500);

    // Use AI PSL scores if available, else fallback to metric average
    const p1Total = myResult?.psl
      ? Number(myResult.psl.toFixed(2))
      : Number((scores.reduce((a, s) => a + s.p1, 0) / scores.length / 10).toFixed(2));
    const p2Total = oppResult?.psl
      ? Number(oppResult.psl.toFixed(2))
      : Number((scores.reduce((a, s) => a + s.p2, 0) / scores.length / 10).toFixed(2));

    setScoreP1(isPlayer1 ? p1Total : p2Total);
    setScoreP2(isPlayer1 ? p2Total : p1Total);

    await delay(800);
    setPhase("done");

    if (!isTest && isPlayer1) {
      startTransition(async () => {
        const token = authToken;
        if (!token) return;
        const args = {
          matchId,
          aiScoreP1: isPlayer1 ? p1Total : p2Total,
          aiScoreP2: isPlayer1 ? p2Total : p1Total,
        };
        await finalizeFreeMatchResult(token, args);
        router.refresh();
      });
    }
  }

  // myAiResult is always from localVideoRef (my camera); oppAiResult from remoteVideoRef (opponent's camera)
  const myDisplayResult = myAiResult;
  const oppDisplayResult = oppAiResult;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-white truncate" style={{ fontFamily: "var(--font-heading)" }}>
            Live Match
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {betAmount.toLocaleString()} MC staked · pot {(betAmount * 2).toLocaleString()} MC
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isCompleted && phase === "idle" && (
            <button
              onClick={() => {
                setTestMode(true);
                setMyReady(true);
                setOppReady(true);
                setTimeout(() => startAnalysis(true), 100);
              }}
              className="flex items-center gap-1.5 border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/20 transition-colors min-h-[40px]"
            >
              <FlaskConical className="size-3.5" />
              <span className="hidden sm:inline">TEST (free)</span>
              <span className="sm:hidden">TEST</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-3 py-2 min-h-[40px]">
            <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">
              {testMode ? "TEST" : "Live"}
            </span>
          </div>
        </div>
      </div>

      {/* Connection error banner */}
      {mediaError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="shrink-0">⚠</span>
          <span>{mediaError}</span>
        </div>
      )}

      {/* Camera feeds — side by side on desktop, stacked on mobile */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {/* YOUR side */}
        <div className="space-y-2">
          <LocalVideoBox
            ref={localVideoRef}
            track={localVideoTrack}
            accentColor="gold"
            cardOverlay={
              ["verdict", "done"].includes(phase) && (myDisplayResult?.psl ?? myScore ?? 0) > 0
                ? <PslCard psl={myDisplayResult?.psl ?? myScore!} tier={myDisplayResult?.tier} dom={myDisplayResult?.strengths ?? undefined} flaw={myDisplayResult?.failos ?? undefined} label="YOUR SCAN" />
                : undefined
            }
          />
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-300">YOU</span>
              {/* Inline score on mobile after done */}
              {phase === "done" && myDisplayResult && (
                <span className="text-xs font-mono text-yellow-400 sm:hidden">
                  PSL {myDisplayResult.psl.toFixed(1)}
                </span>
              )}
            </div>
            {!myReady ? (
              <button
                onClick={() => setMyReady(true)}
                className="px-4 py-2 text-sm font-bold bg-yellow-600 hover:bg-yellow-500 text-white transition-all min-h-[40px] min-w-[80px]"
              >
                Ready
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                <CheckCircle2 className="size-3.5" /> Ready
              </span>
            )}
          </div>
          {/* Score panel desktop only */}
          <div className="hidden sm:block">
            <ScoreSidePanel result={myDisplayResult} color="gold" phase={phase} horizontal />
          </div>
        </div>

        {/* OPPONENT side */}
        <div className="space-y-2">
          <RemoteVideoBox
            ref={remoteVideoRef}
            track={remoteVideoTrack}
            accentColor="red"
            cardOverlay={
              ["verdict", "done"].includes(phase) && (oppDisplayResult?.psl ?? oppScore ?? 0) > 0
                ? <PslCard psl={oppDisplayResult?.psl ?? oppScore!} tier={oppDisplayResult?.tier} dom={oppDisplayResult?.strengths ?? undefined} flaw={oppDisplayResult?.failos ?? undefined} label="ENEMY SCAN" />
                : undefined
            }
            overlay={
              audioMuted ? (
                <button
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-black/80 px-3 py-1.5 text-xs font-bold text-yellow-300 backdrop-blur-sm hover:bg-black transition-colors shadow-lg"
                  onClick={unlockAudio}
                >
                  🔇 Start Audio
                </button>
              ) : undefined
            }
          />
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-300">OPPONENT</span>
              {phase === "done" && oppDisplayResult && (
                <span className="text-xs font-mono text-red-400 sm:hidden">
                  PSL {oppDisplayResult.psl.toFixed(1)}
                </span>
              )}
            </div>
            {oppReady ? (
              <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                <CheckCircle2 className="size-3.5" /> Ready
              </span>
            ) : (
              <span className="text-xs text-zinc-600">Waiting...</span>
            )}
          </div>
          <div className="hidden sm:block">
            <ScoreSidePanel result={oppDisplayResult} color="red" phase={phase} horizontal />
          </div>
        </div>
      </div>

      {/* Idle: both ready → start button */}
      <AnimatePresence mode="wait">
        {phase === "idle" && bothReady && !isCompleted && (
          <motion.div
            key="start"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <button
              onClick={() => startAnalysis(false)}
              className="w-full bg-red-600 hover:bg-red-500 py-4 sm:py-5 text-base sm:text-lg font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1 min-h-[56px]"
            >
              <Swords className="size-5 sm:size-6" />
              Begin AI Judgment
            </button>
          </motion.div>
        )}

        {phase === "idle" && !bothReady && !isCompleted && (
          <motion.div
            key="waiting-ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center"
          >
            <p className="text-sm text-zinc-400">
              {myReady && !oppReady
                ? "Waiting for opponent to ready up..."
                : !myReady
                  ? "Click \"Ready\" to signal you're set."
                  : ""}
            </p>
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/90 py-10"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">AI Initializing</p>
            <motion.div
              key={countdown}
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-8xl font-black text-yellow-300"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}

        {/* Analysis phase */}
        {phase === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-yellow-500/20 bg-zinc-950/90 overflow-hidden"
          >
            <div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-2">
              <Loader2 className="size-4 text-yellow-400 animate-spin" />
              <span className="text-sm font-semibold text-yellow-300 tracking-wide">
                AI ANALYSIS IN PROGRESS
              </span>
              <span className="ml-auto text-xs text-zinc-600">
                {revealedMetrics.length}/{METRICS.length} metrics
              </span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {METRICS.map((metric, i) => {
                const revealed = revealedMetrics.includes(i);
                const scores = metricScores[i];
                return (
                  <AnimatePresence key={metric}>
                    {revealed && scores ? (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="px-5 py-3 flex items-center gap-4"
                      >
                        <span className="text-sm text-zinc-400 w-36 shrink-0">{metric}</span>
                        <div className="flex-1 flex items-center gap-3">
                          <span className="text-xs font-mono text-yellow-300 w-10 text-right">
                            {scores.p1.toFixed(1)}
                          </span>
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex gap-px">
                            <motion.div
                              className="h-full bg-yellow-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${scores.p1}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                          <div className="w-px h-3 bg-zinc-700" />
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex gap-px">
                            <motion.div
                              className="h-full bg-red-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${scores.p2}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                          <span className="text-xs font-mono text-red-300 w-10">
                            {scores.p2.toFixed(1)}
                          </span>
                        </div>
                        <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Verdict building */}
        {phase === "verdict" && (
          <motion.div
            key="verdict-building"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-yellow-500/20 bg-zinc-950/95 py-12 space-y-4"
          >
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="size-2 rounded-full bg-yellow-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
            <p
              className="text-xl font-bold text-yellow-300 tracking-widest uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Computing Verdict
            </p>
            <p className="text-xs text-zinc-600">Cross-referencing genetic phenotypes...</p>
          </motion.div>
        )}

        {/* Done — verdict revealed */}
        {phase === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0.3 }}
            className={`relative overflow-hidden border ${
              iWon
                ? "border-yellow-500/40 bg-zinc-950"
                : "border-red-500/30 bg-zinc-950"
            } p-6 space-y-5`}
          >
            {testMode && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-yellow-300">TEST MODE — no MC deducted</p>
              </div>
            )}

            <div className="relative text-center space-y-2">
              <div className="flex justify-center mb-4">
                {iWon ? (
                  <Trophy className="size-10 text-yellow-400" />
                ) : (
                  <Skull className="size-10 text-red-400" />
                )}
              </div>
              <h2
                className={`text-4xl font-black tracking-tight ${iWon ? "text-yellow-200" : "text-red-300"}`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {opponentAbandoned && iWon ? "OPPONENT FLED" : iWon ? "YOU MOGGED HIM" : "YOU GOT MOGGED"}
              </h2>
              <p className="text-zinc-500 text-sm">
                {opponentAbandoned && iWon
                  ? "Opponent left the match — their bet is yours"
                  : iWon
                    ? "Facial superiority confirmed by AI"
                    : "The numbers don't lie"}
              </p>
            </div>

            {/* AI verdict quotes */}
            {(myDisplayResult?.verdict || oppDisplayResult?.verdict) && (
              <div className="grid grid-cols-2 gap-2">
                {myDisplayResult?.verdict && (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-yellow-500 uppercase tracking-wider">AI on you</p>
                      {myDisplayResult.tier && (() => { const t = TIER_META[myDisplayResult.tier!]; return <span className={`text-[9px] font-black px-1.5 py-0.5 border ${t.border} ${t.bg} ${t.color}`}>{t.label}</span>; })()}
                    </div>
                    <p className="text-xs text-zinc-300 italic">{`\u201C${myDisplayResult.verdict}\u201D`}</p>
                    {myDisplayResult.strengths && myDisplayResult.strengths !== "n/a" && (
                      <p className="text-[10px] text-green-400">+ {myDisplayResult.strengths}</p>
                    )}
                    {myDisplayResult.failos && myDisplayResult.failos !== "none" && myDisplayResult.failos !== "n/a" && (
                      <p className="text-[10px] text-red-400">- {myDisplayResult.failos}</p>
                    )}
                  </div>
                )}
                {oppDisplayResult?.verdict && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-red-500 uppercase tracking-wider">AI on opponent</p>
                      {oppDisplayResult.tier && (() => { const t = TIER_META[oppDisplayResult.tier!]; return <span className={`text-[9px] font-black px-1.5 py-0.5 border ${t.border} ${t.bg} ${t.color}`}>{t.label}</span>; })()}
                    </div>
                    <p className="text-xs text-zinc-300 italic">{`\u201C${oppDisplayResult.verdict}\u201D`}</p>
                    {oppDisplayResult.strengths && oppDisplayResult.strengths !== "n/a" && (
                      <p className="text-[10px] text-green-400">+ {oppDisplayResult.strengths}</p>
                    )}
                    {oppDisplayResult.failos && oppDisplayResult.failos !== "none" && oppDisplayResult.failos !== "n/a" && (
                      <p className="text-[10px] text-red-400">- {oppDisplayResult.failos}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Score comparison */}
            <div className="relative grid grid-cols-2 gap-2 sm:gap-3">
              <ScoreCard
                label="YOU"
                score={myScore}
                won={iWon}
                color={iWon ? "gold" : "zinc"}
                psl={myDisplayResult?.psl ?? null}
                rating={myDisplayResult?.rating ?? null}
                result={myDisplayResult}
              />
              <ScoreCard
                label="OPPONENT"
                score={oppScore}
                won={!iWon}
                color={!iWon ? "gold" : "zinc"}
                psl={oppDisplayResult?.psl ?? null}
                rating={oppDisplayResult?.rating ?? null}
                result={oppDisplayResult}
              />
            </div>

            {/* P&L — hidden in test mode */}
            {!testMode && (
              <div className={`relative rounded-xl border px-4 py-3 text-center ${
                iWon ? "border-green-500/30 bg-green-500/10" : "border-red-500/20 bg-red-500/8"
              }`}>
                <p className={`text-2xl font-black tabular-nums ${iWon ? "text-green-300" : "text-red-400"}`}
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {iWon ? `+${(betAmount * 2).toLocaleString()}` : `-${betAmount.toLocaleString()}`} MC
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {iWon ? "deposited to your wallet" : "taken by winner"}
                </p>
              </div>
            )}

            <div className="relative flex gap-3">
              {isFreeMatch ? (
                <>
                  {/* Molecule battle: rematch same person */}
                  <button
                    onClick={() => {
                      setRtcEnabled(false);
                      leaveChannel();
                      if (!authToken || !opponentId) { router.push("/arena"); return; }
                      startTransition(async () => {
                        try {
                          const { matchId: newId } = await rematchSameOpponent(authToken, matchId);
                          if (newId) router.push(`/match/${newId}`);
                          else router.push("/arena");
                        } catch {
                          router.push("/arena");
                        }
                      });
                    }}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-500 py-4 text-sm sm:text-base font-black text-white transition-colors min-h-[52px] uppercase tracking-widest"
                  >
                    Rematch
                  </button>
                  {/* Molecule battle: go to arena (ranked) */}
                  <button
                    onClick={() => {
                      setRtcEnabled(false);
                      leaveChannel();
                      router.push("/arena");
                    }}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-500 py-4 text-sm sm:text-base font-black text-white transition-colors min-h-[52px] uppercase tracking-widest"
                  >
                    Next
                  </button>
                </>
              ) : (
                <>
                  {/* Paid battle: standard rematch flow */}
                  <button
                    onClick={() => {
                      setRtcEnabled(false);
                      leaveChannel();
                      router.push("/battle");
                    }}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-500 py-4 text-sm sm:text-base font-black text-white transition-colors min-h-[52px] uppercase tracking-widest"
                  >
                    {testMode ? "Battle for real" : "Rematch"}
                  </button>
                  <button
                    onClick={() => {
                      setRtcEnabled(false);
                      leaveChannel();
                      router.push("/dashboard");
                    }}
                    className="flex-1 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-4 text-sm sm:text-base font-bold text-zinc-300 transition-colors min-h-[52px]"
                  >
                    Dashboard
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Score panel shown below camera on desktop
function ScoreSidePanel({
  result,
  color,
  phase,
  horizontal = false,
}: {
  result: AiResult;
  color: "gold" | "red";
  phase: Phase;
  horizontal?: boolean;
}) {
  const colorMap = {
    gold: {
      border: "border-yellow-500/30",
      bg: "bg-yellow-500/5",
      text: "text-yellow-300",
      label: "text-yellow-500",
    },
    red: {
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      text: "text-red-300",
      label: "text-red-500",
    },
  }[color];

  const showScores = phase === "done" && result && result.psl > 0;

  return (
    <div className={`flex items-center justify-center gap-4 border ${colorMap.border} ${colorMap.bg} px-4 py-2`}>
      {showScores ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${colorMap.label}`}>PSL</span>
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`text-lg font-black tabular-nums ${colorMap.text}`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {result!.psl.toFixed(1)}
            </motion.span>
          </div>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${colorMap.label}`}>RTG</span>
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className={`text-lg font-black tabular-nums ${colorMap.text}`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {result!.rating.toFixed(1)}
            </motion.span>
            <span className="text-[10px] text-zinc-600">/10</span>
          </div>
        </>
      ) : (
        <>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${colorMap.label}`}>PSL —</span>
          <div className="h-4 w-px bg-zinc-800" />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${colorMap.label}`}>RTG —</span>
          {(phase === "analyzing" || phase === "verdict") && (
            <Loader2 className={`size-3 animate-spin ${colorMap.text} opacity-50`} />
          )}
        </>
      )}
    </div>
  );
}

function ScoreCard({
  label,
  score,
  won,
  color,
  psl,
  rating,
  result,
}: {
  label: string;
  score: number | null;
  won: boolean;
  color: "gold" | "zinc";
  psl: number | null;
  rating: number | null;
  result?: AiResult;
}) {
  const accent = color === "gold" ? "text-yellow-300" : "text-zinc-400";
  const hasBreakdown = result && result.harm !== undefined;
  return (
    <div className={`rounded-xl border p-3 text-center ${
      won ? "border-yellow-500/30 bg-yellow-500/8" : "border-zinc-800 bg-zinc-900/50"
    }`}>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`text-3xl font-black tabular-nums ${accent}`}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {psl !== null && psl > 0 ? psl.toFixed(1) : score !== null ? score.toFixed(1) : "—"}
      </p>
      <p className="text-[10px] text-zinc-600 mb-1">PSL</p>
      {result?.tier && (() => {
        const t = TIER_META[result.tier];
        return (
          <div className={`inline-flex items-center px-2 py-0.5 border ${t.border} ${t.bg} mb-1`}>
            <span className={`text-[10px] font-black uppercase tracking-widest ${t.color}`}>{t.label}</span>
          </div>
        );
      })()}
      {rating !== null && rating > 0 && (
        <p className="text-[10px] text-zinc-500">RTG <span className="text-zinc-300 font-semibold">{rating.toFixed(1)}/10</span></p>
      )}
      {hasBreakdown && (
        <div className="mt-2 space-y-0.5 text-left border-t border-white/5 pt-2">
          {[
            { k: "HARM", v: result!.harm },
            { k: "MISC", v: result!.misc },
            { k: "ANGU", v: result!.angu },
            { k: "DIMO", v: result!.dimo },
          ].map(({ k, v }) => v !== undefined && (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-[9px] text-zinc-600 w-8">{k}</span>
              <div className="flex-1 h-1 bg-zinc-800 overflow-hidden rounded-full">
                <div className={`h-full ${color === "gold" ? "bg-yellow-500" : "bg-cyan-500"}`} style={{ width: `${(v / 10) * 100}%` }} />
              </div>
              <span className="text-[9px] text-zinc-400 tabular-nums w-5 text-right">{v.toFixed(1)}</span>
            </div>
          ))}
          {result!.penalty !== undefined && (
            <p className="text-[9px] text-zinc-600 pt-0.5">penalty -{result!.penalty.toFixed(1)}</p>
          )}
        </div>
      )}
      {won && <p className="text-xs text-yellow-500 mt-1 font-medium">WINNER</p>}
    </div>
  );
}
