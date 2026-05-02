"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { finalizeMatchResult } from "@/app/actions";
import { Loader2, CheckCircle2, Swords, Trophy, Skull, FlaskConical } from "lucide-react";
import { useAgoraVideo, LocalVideoBox, RemoteVideoBox, type VideoBoxHandle } from "@/components/match/agora-video";
import { createClient } from "@/lib/supabase/client";

const METRICS = [
  "Jawline Definition",
  "Hunter Eye Angle",
  "Facial Harmony",
  "FWHR Ratio",
  "Canthal Tilt",
  "Bone Structure",
];

const AUTO_START_DELAY_MS = 3000;

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
  chad:     { label: "CHAD",      color: "text-fuchsia-300", bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/60" },
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

  const { localVideoTrack, remoteVideoTrack, remoteAudioTrack } = useAgoraVideo({
    channelName: matchId,
    uid: isPlayer1 ? 1 : 2,
    enabled: !isCompleted,
  });

  const localVideoRef = useRef<VideoBoxHandle>(null);
  const remoteVideoRef = useRef<VideoBoxHandle>(null);

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
  // Live opponent PSL received via Supabase broadcast
  const [oppLivePsl, setOppLivePsl] = useState<number | null>(null);
  const [testMode, setTestMode] = useState(false);
  // Slowly drifting PSL shown during analysis — nudged by small deltas each metric
  const [myPartialPsl, setMyPartialPsl] = useState<number | null>(null);
  const [oppPartialPsl, setOppPartialPsl] = useState<number | null>(null);
  const analysisStarted = useRef(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { getAccessToken } = usePrivy();

  const TIE_THRESHOLD = 0.05;
  const isTie = scoreP1 !== null && scoreP2 !== null
    && Math.abs(scoreP1 - scoreP2) < TIE_THRESHOLD;
  const iWon = isTie
    ? false
    : winnerId
      ? winnerId === userId
      : scoreP1 !== null && scoreP2 !== null
        ? isPlayer1 ? scoreP1 > scoreP2 : scoreP2 > scoreP1
        : false;

  const myScore = isPlayer1 ? scoreP1 : scoreP2;
  const oppScore = isPlayer1 ? scoreP2 : scoreP1;

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

  // Mute opponent audio when match ends
  useEffect(() => {
    if (phase === "done" && remoteAudioTrack) {
      try { remoteAudioTrack.setVolume(0); } catch { /* ignore */ }
    }
  }, [phase, remoteAudioTrack]);

  // Supabase broadcast channel for live score sharing
  useEffect(() => {
    if (isCompleted) return;
    const supabase = createClient();
    const channel = supabase.channel(`match-scores:${matchId}`, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "psl" }, ({ payload }: { payload: { from: "p1" | "p2"; psl: number; result?: AiResult } }) => {
        const fromOpponent = isPlayer1 ? payload.from === "p2" : payload.from === "p1";
        if (fromOpponent) {
          setOppLivePsl(payload.psl);
          if (payload.result) setOppAiResult(payload.result);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, isPlayer1, isCompleted]);

  async function startAnalysis(isTest = false) {
    analysisStarted.current = true;
    setPhase("countdown");
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await delay(900);
    }

    setPhase("analyzing");
    setRevealedMetrics([]);
    setMetricScores([]);
    setMyPartialPsl(5.0);
    setOppPartialPsl(5.0);

    const myFrame = localVideoRef.current?.captureFrame() ?? null;
    const oppFrame = isTest ? myFrame : (remoteVideoRef.current?.captureFrame() ?? null);

    // Capture AI results into refs as soon as they land (before metric loop ends)
    let resolvedMyPsl: number | null = null;
    let resolvedOppPsl: number | null = null;
    const myResultPromise = (myFrame ? judgeFace(myFrame) : Promise.resolve(null)).then((r) => {
      resolvedMyPsl = r?.psl ?? null;
      return r;
    });
    const oppResultPromise = (oppFrame ? judgeFace(oppFrame) : Promise.resolve(null)).then((r) => {
      resolvedOppPsl = r?.psl ?? null;
      return r;
    });

    const scores: { p1: number; p2: number }[] = [];
    for (let i = 0; i < METRICS.length; i++) {
      // ~2s per metric → 12s total for 6 metrics
      await delay(1900 + Math.random() * 200);
      const ms = { p1: 70 + Math.random() * 30, p2: 70 + Math.random() * 30 };
      scores.push(ms);
      setMetricScores([...scores]);
      setRevealedMetrics((prev) => [...prev, i]);

      // Start at 5.0, move toward AI PSL once known, wobble once arrived
      const driftToward = (prev: number | null, target: number | null): number => {
        const current = prev ?? 5.0;
        if (target === null) {
          // AI not back yet — hold near 5 with micro drift
          const noise = Math.random() * 0.04 - 0.02;
          return Number(Math.max(4.85, Math.min(5.15, current + noise)).toFixed(2));
        }
        const gap = target - current;
        const dist = Math.abs(gap);
        if (dist < 0.12) {
          // Arrived — tiny wobble around target
          const wobble = Math.random() * 0.06 - 0.03;
          return Number(Math.max(1, Math.min(9.9, current + wobble)).toFixed(2));
        }
        // Step ~35% of remaining gap + tiny noise
        const step = Math.sign(gap) * Math.min(dist * 0.35, 0.4);
        const noise = Math.random() * 0.04 - 0.02;
        return Number(Math.max(1, Math.min(9.9, current + step + noise)).toFixed(2));
      };
      setMyPartialPsl((prev) => driftToward(prev, resolvedMyPsl));
      setOppPartialPsl((prev) => driftToward(prev, resolvedOppPsl));
    }

    const [myResult, oppResult] = await Promise.all([myResultPromise, oppResultPromise]);
    setMyAiResult(myResult);
    if (oppResult) setOppAiResult(oppResult);

    // Small distinct jitter per player so ties are essentially impossible
    const jitter1 = 0.001 + Math.random() * 0.009;
    const jitter2 = 0.001 + Math.random() * 0.009;
    const p1Total = myResult?.psl
      ? Number((myResult.psl + jitter1).toFixed(3))
      : Number(((scores.reduce((a, s) => a + s.p1, 0) / scores.length / 10) + jitter1).toFixed(3));
    const p2Total = (oppResult?.psl || oppLivePsl)
      ? Number(((oppResult?.psl ?? oppLivePsl!) + jitter2).toFixed(3))
      : Number(((scores.reduce((a, s) => a + s.p2, 0) / scores.length / 10) + jitter2).toFixed(3));

    // Broadcast my score so opponent sees it
    if (!isTest) {
      try {
        const supabase = createClient();
        const channel = supabase.channel(`match-scores:${matchId}`, { config: { broadcast: { self: false } } });
        await channel.subscribe();
        await channel.send({
          type: "broadcast",
          event: "psl",
          payload: { from: isPlayer1 ? "p1" : "p2", psl: isPlayer1 ? p1Total : p2Total, result: myResult },
        });
        supabase.removeChannel(channel);
      } catch { /* non-critical */ }
    }

    // Clear partial scores — real scores take over
    setMyPartialPsl(null);
    setOppPartialPsl(null);

    await delay(1200);
    setPhase("verdict");
    await delay(2000);

    setScoreP1(isPlayer1 ? p1Total : p2Total);
    setScoreP2(isPlayer1 ? p2Total : p1Total);

    await delay(600);
    setPhase("done");

    if (!isTest && isPlayer1) {
      startTransition(async () => {
        const token = await getAccessToken();
        if (!token) return;
        await finalizeMatchResult(token, {
          matchId,
          aiScoreP1: isPlayer1 ? p1Total : p2Total,
          aiScoreP2: isPlayer1 ? p2Total : p1Total,
        });
        router.refresh();
      });
    }
  }

  // Auto-start analysis shortly after match loads
  useEffect(() => {
    if (isCompleted || analysisStarted.current) return;
    const timer = setTimeout(() => {
      if (!analysisStarted.current) startAnalysis(false);
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted]);

  const myDisplayResult = isPlayer1 ? myAiResult : oppAiResult;
  const oppDisplayResult = isPlayer1 ? oppAiResult : myAiResult;

  // Resolved opponent PSL: real result > live broadcast > null
  const resolvedOppPsl = oppDisplayResult?.psl ?? oppLivePsl;

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
                analysisStarted.current = true;
                startAnalysis(true);
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

      {/* Camera feeds */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {/* YOUR side */}
        <div className="space-y-2">
          <LocalVideoBox
            ref={localVideoRef}
            track={localVideoTrack}
            label="YOU"
            accentColor="fuchsia"
            showFaceMesh
          />
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-300">YOU</span>
              {phase === "done" && myDisplayResult && (
                <span className="text-xs font-mono text-fuchsia-400 sm:hidden">
                  PSL {myDisplayResult.psl.toFixed(1)}
                </span>
              )}
            </div>
            {phase === "idle" && (
              <span className="flex items-center gap-1 text-xs font-medium text-yellow-400">
                <Loader2 className="size-3.5 animate-spin" /> Starting…
              </span>
            )}
            {phase !== "idle" && phase !== "done" && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                <CheckCircle2 className="size-3.5" /> Live
              </span>
            )}
          </div>
          {/* Live partial score during analyzing */}
          <div className="hidden sm:block">
            <ScoreSidePanel
              result={phase === "done" ? myDisplayResult : null}
              partialPsl={myPartialPsl}
              color="fuchsia"
              phase={phase}
              horizontal
            />
          </div>
        </div>

        {/* OPPONENT side */}
        <div className="space-y-2">
          <RemoteVideoBox
            ref={remoteVideoRef}
            track={remoteVideoTrack}
            label="OPPONENT"
            accentColor="red"
            showFaceMesh
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
            {resolvedOppPsl !== null && phase !== "done" && (
              <span className="text-xs font-mono text-red-400">PSL {resolvedOppPsl.toFixed(1)}</span>
            )}
          </div>
          <div className="hidden sm:block">
            <ScoreSidePanel
              result={phase === "done" ? oppDisplayResult : null}
              partialPsl={oppPartialPsl ?? resolvedOppPsl}
              color="red"
              phase={phase}
              horizontal
            />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Idle — waiting for auto-start */}
        {phase === "idle" && !isCompleted && (
          <motion.div
            key="waiting-ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center"
          >
            <p className="text-sm text-zinc-400">AI analysis starts in a moment…</p>
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
            className={`relative overflow-hidden border ${
              isTie
                ? "border-yellow-500/30 bg-zinc-950"
                : iWon
                  ? "border-fuchsia-500/40 bg-zinc-950"
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
                {isTie ? (
                  <span className="text-4xl">🤝</span>
                ) : iWon ? (
                  <Trophy className="size-10 text-yellow-400" />
                ) : (
                  <Skull className="size-10 text-red-400" />
                )}
              </div>
              <h2
                className={`text-4xl font-black tracking-tight ${isTie ? "text-yellow-200" : iWon ? "text-fuchsia-200" : "text-red-300"}`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {isTie ? "DEAD HEAT" : iWon ? "YOU MOGGED HIM" : "YOU GOT MOGGED"}
              </h2>
              <p className="text-zinc-500 text-sm">
                {isTie ? "Scores too close to call — bets returned" : iWon ? "Facial superiority confirmed by AI" : "The numbers don't lie"}
              </p>
            </div>

            {/* AI verdict quotes */}
            {(myDisplayResult?.verdict || oppDisplayResult?.verdict) && (
              <div className="grid grid-cols-2 gap-2">
                {myDisplayResult?.verdict && (
                  <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-fuchsia-500 uppercase tracking-wider">AI on you</p>
                      {myDisplayResult.tier && (() => { const t = TIER_META[myDisplayResult.tier!]; return <span className={`text-[9px] font-black px-1.5 py-0.5 border ${t.border} ${t.bg} ${t.color}`}>{t.label}</span>; })()}
                    </div>
                    <p className="text-xs text-zinc-300 italic">{`“${myDisplayResult.verdict}”`}</p>
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
                    <p className="text-xs text-zinc-300 italic">{`“${oppDisplayResult.verdict}”`}</p>
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
                color={iWon ? "fuchsia" : "zinc"}
                psl={myDisplayResult?.psl ?? null}
                rating={myDisplayResult?.rating ?? null}
                result={myDisplayResult}
              />
              <ScoreCard
                label="OPPONENT"
                score={oppScore}
                won={!iWon}
                color={!iWon ? "fuchsia" : "zinc"}
                psl={oppDisplayResult?.psl ?? null}
                rating={oppDisplayResult?.rating ?? null}
                result={oppDisplayResult}
              />
            </div>

            {/* P&L */}
            {!testMode && (
              <div className={`relative rounded-xl border px-4 py-3 text-center ${
                isTie
                  ? "border-yellow-500/30 bg-yellow-500/10"
                  : iWon ? "border-green-500/30 bg-green-500/10" : "border-red-500/20 bg-red-500/8"
              }`}>
                <p className={`text-2xl font-black tabular-nums ${isTie ? "text-yellow-300" : iWon ? "text-green-300" : "text-red-400"}`}
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {isTie ? `±0` : iWon ? `+${(betAmount * 2).toLocaleString()}` : `-${betAmount.toLocaleString()}`} MC
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isTie ? "bet returned to both players" : iWon ? "deposited to your wallet" : "taken by winner"}
                </p>
              </div>
            )}

            <div className="relative flex gap-3">
              <button
                onClick={() => router.push("/battle")}
                className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 py-4 text-sm sm:text-base font-black text-white transition-colors min-h-[52px] uppercase tracking-widest"
              >
                {testMode ? "Battle for real" : "Rematch"}
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="flex-1 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-4 text-sm sm:text-base font-bold text-zinc-300 transition-colors min-h-[52px]"
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

function ScoreSidePanel({
  result,
  partialPsl,
  color,
  phase,
  horizontal = false,
}: {
  result: AiResult;
  partialPsl?: number | null;
  color: "fuchsia" | "red";
  phase: Phase;
  horizontal?: boolean;
}) {
  const colorMap = {
    fuchsia: {
      border: "border-fuchsia-500/30",
      bg: "bg-fuchsia-500/5",
      text: "text-fuchsia-300",
      label: "text-fuchsia-500",
    },
    red: {
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      text: "text-red-300",
      label: "text-red-500",
    },
  }[color];

  const showFinalScores = phase === "done" && result && result.psl > 0;
  const showPartial = (phase === "analyzing" || phase === "verdict") && partialPsl !== null && partialPsl !== undefined;

  return (
    <div className={`flex items-center justify-center gap-4 border ${colorMap.border} ${colorMap.bg} px-4 py-2`}>
      {showFinalScores ? (
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
      ) : showPartial ? (
        <>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${colorMap.label}`}>PSL</span>
          <motion.span
            key={partialPsl}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            className={`text-lg font-black tabular-nums ${colorMap.text}`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {partialPsl!.toFixed(1)}
          </motion.span>
          <Loader2 className={`size-3 animate-spin ${colorMap.text} opacity-50`} />
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
  color: "fuchsia" | "zinc";
  psl: number | null;
  rating: number | null;
  result?: AiResult;
}) {
  const accent = color === "fuchsia" ? "text-fuchsia-300" : "text-zinc-400";
  const hasBreakdown = result && result.harm !== undefined;
  return (
    <div className={`rounded-xl border p-3 text-center ${
      won ? "border-fuchsia-500/30 bg-fuchsia-500/8" : "border-zinc-800 bg-zinc-900/50"
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
        const t = TIER_META[result.tier!];
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
                <div className={`h-full ${color === "fuchsia" ? "bg-fuchsia-500" : "bg-cyan-500"}`} style={{ width: `${(v / 10) * 100}%` }} />
              </div>
              <span className="text-[9px] text-zinc-400 tabular-nums w-5 text-right">{v.toFixed(1)}</span>
            </div>
          ))}
          {result!.penalty !== undefined && (
            <p className="text-[9px] text-zinc-600 pt-0.5">penalty -{result!.penalty.toFixed(1)}</p>
          )}
        </div>
      )}
      {won && <p className="text-xs text-fuchsia-500 mt-1 font-medium">WINNER</p>}
    </div>
  );
}
