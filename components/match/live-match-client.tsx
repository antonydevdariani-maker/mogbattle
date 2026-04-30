"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { finalizeMatchResult } from "@/app/actions";
import { Loader2, CheckCircle2, Swords, Trophy, Skull } from "lucide-react";

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

export function LiveMatchClient({
  matchId,
  isPlayer1,
  initialStatus,
  winnerId,
  userId,
  betAmount,
  initialAiP1,
  initialAiP2,
}: {
  matchId: string;
  isPlayer1: boolean;
  initialStatus: string;
  winnerId: string | null;
  userId: string;
  betAmount: number;
  initialAiP1: number | null;
  initialAiP2: number | null;
}) {
  const isCompleted = initialStatus === "completed";

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
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { getAccessToken } = usePrivy();

  const iWon = winnerId
    ? winnerId === userId
    : scoreP1 !== null && scoreP2 !== null
      ? isPlayer1 ? scoreP1 >= scoreP2 : scoreP2 >= scoreP1
      : false;

  const myScore = isPlayer1 ? scoreP1 : scoreP2;
  const oppScore = isPlayer1 ? scoreP2 : scoreP1;

  const bothReady = myReady && oppReady;

  // Restore existing completed match scores
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

  async function startAnalysis() {
    // Countdown
    setPhase("countdown");
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await delay(900);
    }

    // Analysis phase
    setPhase("analyzing");
    setRevealedMetrics([]);
    setMetricScores([]);

    const scores: { p1: number; p2: number }[] = [];
    for (let i = 0; i < METRICS.length; i++) {
      await delay(1800 + Math.random() * 800);
      const ms = { p1: 70 + Math.random() * 30, p2: 70 + Math.random() * 30 };
      scores.push(ms);
      setMetricScores([...scores]);
      setRevealedMetrics((prev) => [...prev, i]);
    }

    // Verdict pause
    await delay(1200);
    setPhase("verdict");

    await delay(2500);

    // Compute final scores
    const p1Total = Number((scores.reduce((a, s) => a + s.p1, 0) / scores.length).toFixed(2));
    const p2Total = Number((scores.reduce((a, s) => a + s.p2, 0) / scores.length).toFixed(2));
    setScoreP1(p1Total);
    setScoreP2(p2Total);

    await delay(800);
    setPhase("done");

    // Only p1 triggers the server write to avoid double-finalize race
    if (isPlayer1) {
      startTransition(async () => {
        const token = await getAccessToken();
        if (!token) return;
        await finalizeMatchResult(token, { matchId, aiScoreP1: p1Total, aiScoreP2: p2Total });
        router.refresh();
      });
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
            Live Match Room
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {betAmount.toLocaleString()} MC staked · pot {(betAmount * 2).toLocaleString()} MC
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5">
          <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Camera feeds */}
      <div className="grid gap-4 md:grid-cols-2">
        <CameraBox
          label="YOU"
          ready={myReady}
          onReady={() => setMyReady(true)}
          analyzing={phase === "analyzing" || phase === "verdict" || phase === "countdown"}
          accentColor="fuchsia"
        />
        <CameraBox
          label="OPPONENT"
          ready={oppReady}
          onReady={() => setOppReady(true)}
          analyzing={phase === "analyzing" || phase === "verdict" || phase === "countdown"}
          accentColor="red"
        />
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
              onClick={startAnalysis}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 py-4 text-base font-bold text-white transition-all glow-red flex items-center justify-center gap-2"
            >
              <Swords className="size-5" />
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
              className="text-8xl font-black text-fuchsia-300"
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
            className="rounded-2xl border border-fuchsia-500/20 bg-zinc-950/90 overflow-hidden"
          >
            <div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-2">
              <Loader2 className="size-4 text-fuchsia-400 animate-spin" />
              <span className="text-sm font-semibold text-fuchsia-300 tracking-wide">
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
                          <span className="text-xs font-mono text-fuchsia-300 w-10 text-right">
                            {scores.p1.toFixed(1)}
                          </span>
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex gap-px">
                            <motion.div
                              className="h-full bg-fuchsia-500 rounded-full"
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
            className={`relative overflow-hidden rounded-2xl border ${
              iWon
                ? "border-fuchsia-500/40 bg-gradient-to-b from-fuchsia-950/80 to-zinc-950"
                : "border-red-500/30 bg-gradient-to-b from-red-950/40 to-zinc-950"
            } p-6 space-y-5`}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: iWon
                  ? `radial-gradient(circle at 50% 0%, oklch(0.72 0.26 305), transparent 60%)`
                  : `radial-gradient(circle at 50% 0%, oklch(0.66 0.26 18), transparent 60%)`,
              }}
            />

            <div className="relative text-center space-y-2">
              <div className="flex justify-center mb-4">
                {iWon ? (
                  <Trophy className="size-10 text-yellow-400" />
                ) : (
                  <Skull className="size-10 text-red-400" />
                )}
              </div>
              <h2
                className={`text-4xl font-black tracking-tight ${iWon ? "text-fuchsia-200" : "text-red-300"}`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {iWon ? "YOU MOGGED HIM" : "YOU GOT MOGGED"}
              </h2>
              <p className="text-zinc-500 text-sm">
                {iWon ? "Facial superiority confirmed by AI" : "The numbers don't lie"}
              </p>
            </div>

            {/* Score comparison */}
            <div className="relative grid grid-cols-2 gap-3">
              <ScoreCard
                label="YOU"
                score={myScore}
                won={iWon}
                color={iWon ? "fuchsia" : "zinc"}
              />
              <ScoreCard
                label="OPPONENT"
                score={oppScore}
                won={!iWon}
                color={!iWon ? "fuchsia" : "zinc"}
              />
            </div>

            {/* P&L */}
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

            <div className="relative flex gap-3">
              <button
                onClick={() => router.push("/battle")}
                className="flex-1 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 py-3 text-sm font-bold text-white transition-colors"
              >
                Rematch
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-3 text-sm font-medium text-zinc-300 transition-colors"
              >
                Dashboard
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CameraBox({
  label,
  ready,
  onReady,
  analyzing,
  accentColor,
}: {
  label: string;
  ready: boolean;
  onReady: () => void;
  analyzing: boolean;
  accentColor: "fuchsia" | "red";
}) {
  const borderClass = ready
    ? accentColor === "fuchsia"
      ? "border-fuchsia-500/50 animate-pulse-border"
      : "border-red-500/50"
    : "border-zinc-800";

  return (
    <div className={`rounded-2xl border ${borderClass} bg-zinc-950/80 overflow-hidden transition-all`}>
      {/* Camera placeholder */}
      <div className="relative aspect-video bg-zinc-950 overflow-hidden scanlines">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              accentColor === "fuchsia"
                ? `radial-gradient(circle at 50% 50%, oklch(0.72 0.26 305 / 0.4), transparent 70%)`
                : `radial-gradient(circle at 50% 50%, oklch(0.66 0.26 18 / 0.3), transparent 70%)`,
          }}
        />
        {analyzing && <div className="scan-line" />}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`size-16 rounded-full border-2 opacity-20 ${
              accentColor === "fuchsia" ? "border-fuchsia-400" : "border-red-400"
            }`}
          />
        </div>
        {ready && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1">
            <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono text-red-400">REC</span>
          </div>
        )}
        <div className="absolute bottom-2 right-2">
          <span className={`text-xs font-bold tracking-widest opacity-60 ${
            accentColor === "fuchsia" ? "text-fuchsia-300" : "text-red-300"
          }`}>
            {label}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-zinc-300">{label}</span>
        {!ready ? (
          <button
            onClick={onReady}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              accentColor === "fuchsia"
                ? "bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
                : "bg-red-700 hover:bg-red-600 text-white"
            }`}
          >
            Ready
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-green-400">
            <CheckCircle2 className="size-3.5" /> Ready
          </span>
        )}
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  won,
  color,
}: {
  label: string;
  score: number | null;
  won: boolean;
  color: "fuchsia" | "zinc";
}) {
  return (
    <div className={`rounded-xl border p-4 text-center ${
      won ? "border-fuchsia-500/30 bg-fuchsia-500/8" : "border-zinc-800 bg-zinc-900/50"
    }`}>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`text-3xl font-black tabular-nums ${
          color === "fuchsia" ? "text-fuchsia-300" : "text-zinc-400"
        }`}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {score !== null ? score.toFixed(1) : "—"}
      </p>
      {won && <p className="text-xs text-fuchsia-500 mt-1 font-medium">WINNER</p>}
    </div>
  );
}
