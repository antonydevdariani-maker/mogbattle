"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  queueForBattle,
  queueForFreeMatch,
  submitBetOffer,
  submitMoleculeBetOffer,
  finalizeMatchResult,
  finalizeFreeMatchResult,
  loadBattleQueueState,
  loadProfileSummary,
  cancelWaitingMatch,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { useAgoraVideo } from "@/components/match/agora-video";
import { FaceMeshCanvas } from "@/components/match/face-mesh-canvas";
import type { Database } from "@/lib/types/database";
import {
  useArenaMatchLeaveSetters,
  useWarnBeforeUnloadIf,
} from "@/components/arena/arena-match-leave-context";
import {
  Swords,
  Trophy,
  Skull,
  Zap,
  Loader2,
  CheckCircle2,
  Wifi,
  WifiOff,
  Atom,
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
  initialMolecules = 0,
  initialMatch,
  initialOpponentName,
  userId,
  displayName,
  walletAddress,
}: {
  initialBalance: number;
  initialMolecules?: number;
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
  const [myPsl, setMyPsl] = useState<number | null>(null);
  const [oppPsl, setOppPsl] = useState<number | null>(null);
  const [isFreeMode, setIsFreeMode] = useState(false);
  const [molecules, setMolecules] = useState(initialMolecules);
  const [lockedBet, setLockedBet] = useState(0);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOppOffer = useRef<number | null>(null);
  const analysisRunning = useRef(false);
  const queueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchmakingIntentRef = useRef(false);
  const timedOutBattleRef = useRef(false);
  const queueTimedOutRef = useRef(false);
  const autoJudgeDone = useRef(false);
  const pslCaptures = useRef<number[]>([]);
  const [noFaceWarning, setNoFaceWarning] = useState(false);

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

  /** Full channel participation — needs a match ID. */
  const videoEnabled =
    !!match?.id &&
    ["queued", "negotiating", "live", "countdown", "analyzing", "verdict", "done"].includes(phase);

  /** Local cam/mic preview starts as soon as user enters queue, before match ID is assigned. */
  const localPreviewOnly = phase !== "idle" && !videoEnabled;

  const { localVideoTrack, remoteVideoTrack, mediaError } = useAgoraVideo({
    channelName: match?.id ?? "",
    uid: isP1 ? 1 : 2,
    enabled: videoEnabled,
    localOnly: localPreviewOnly,
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const p = await loadProfileSummary(token);
    setBalance(p?.total_credits ?? 0);
    setMolecules(p?.molecules ?? 0);
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
    if (!match?.id || !["queued", "negotiating", "live"].includes(phase)) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`arena:${match.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${match.id}` },
        (payload) => {
          const updated = payload.new as MatchRow;
          if (updated.status === "cancelled") { poll(); return; }
          setMatch(updated);
          const curOpp = isP1 ? updated.player2_bet_offer : updated.player1_bet_offer;
          if (curOpp !== prevOppOffer.current) {
            prevOppOffer.current = curOpp;
            setOppTyping(true);
            if (oppTypingRef.current) clearTimeout(oppTypingRef.current);
            oppTypingRef.current = setTimeout(() => setOppTyping(false), 2000);
          }
          if (updated.status === "matched") { setPhase("negotiating"); }
          if (updated.status === "live") { setPhase("live"); refreshBalance(); }
        }
      )
      .on("broadcast", { event: "psl" }, ({ payload }) => {
        // Receive opponent's PSL broadcast
        if (payload.userId !== userId) {
          setOppPsl((prev) => prev === null ? payload.psl : Math.max(prev, payload.psl));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match?.id, phase, isP1, refreshBalance, poll, userId]);

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

  // Auto-capture at 2.5s and 4s — use best PSL, broadcast to opponent
  useEffect(() => {
    if (phase !== "live" || !localVideoTrack) return;

    async function captureAndJudge() {
      try {
        const frameData = (localVideoTrack as ICameraVideoTrack).getCurrentFrameData();
        if (!frameData || frameData.width === 0) return null;
        const canvas = document.createElement("canvas");
        canvas.width = frameData.width;
        canvas.height = frameData.height;
        const ctx = canvas.getContext("2d")!;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.putImageData(frameData, 0, 0);
        const base64 = canvas.toDataURL("image/jpeg", 0.9);
        const res = await fetch("/api/judge-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        const data = await res.json();
        return (data.psl && data.psl > 0) ? (data.psl as number) : null;
      } catch { return null; }
    }

    const t1 = setTimeout(async () => {
      const psl = await captureAndJudge();
      if (psl) {
        pslCaptures.current.push(psl);
        const best = Math.max(...pslCaptures.current);
        setMyPsl(best);
        // Broadcast to opponent via realtime
        if (match?.id) {
          const supabase = createClient();
          supabase.channel(`arena:${match.id}`).send({
            type: "broadcast", event: "psl",
            payload: { userId, psl: best },
          });
        }
      }
    }, 2500);

    const t2 = setTimeout(async () => {
      autoJudgeDone.current = true;
      const psl = await captureAndJudge();
      if (psl) {
        pslCaptures.current.push(psl);
        const best = Math.max(...pslCaptures.current);
        setMyPsl(best);
        if (match?.id) {
          const supabase = createClient();
          supabase.channel(`arena:${match.id}`).send({
            type: "broadcast", event: "psl",
            payload: { userId, psl: best },
          });
        }
      }
    }, 4000);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, localVideoTrack, match?.id, userId]);

  // Face presence check — warn at 5s, auto-forfeit (score 0) at 10s if no face
  useEffect(() => {
    if (phase !== "live" || !localVideoTrack) return;

    async function hasFace(): Promise<boolean> {
      try {
        const frameData = (localVideoTrack as ICameraVideoTrack).getCurrentFrameData();
        if (!frameData || frameData.width === 0) return false;
        const canvas = document.createElement("canvas");
        canvas.width = frameData.width;
        canvas.height = frameData.height;
        const ctx = canvas.getContext("2d")!;
        ctx.putImageData(frameData, 0, 0);
        const base64 = canvas.toDataURL("image/jpeg", 0.7);
        const res = await fetch("/api/judge-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        const data = await res.json();
        return !!(data.psl && data.psl > 0);
      } catch { return true; } // network fail → assume face present
    }

    const warnTimer = setTimeout(() => setNoFaceWarning(true), 5000);

    const forfeitTimer = setTimeout(async () => {
      const faceFound = await hasFace();
      if (!faceFound) {
        // Force a PSL of 0 so opponent wins
        setMyPsl(0);
        pslCaptures.current = [0];
        if (match?.id) {
          const supabase = createClient();
          supabase.channel(`arena:${match.id}`).send({
            type: "broadcast", event: "psl",
            payload: { userId, psl: 0 },
          });
        }
      } else {
        setNoFaceWarning(false);
      }
    }, 10000);

    return () => { clearTimeout(warnTimer); clearTimeout(forfeitTimer); };
  }, [phase, localVideoTrack, match?.id, userId]);

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
    const capped = isFreeMode ? Math.min(amount, molecules) : Math.min(amount, balance);
    submitTimerRef.current = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        if (isFreeMode) {
          await submitMoleculeBetOffer(token, match.id, capped);
        } else {
          await submitBetOffer(token, match.id, capped);
        }
      } catch {}
    }, 300);
  }

  function onOfferChange(val: string) {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    const amount = parseInt(cleaned, 10);
    const cap = isFreeMode ? molecules : balance;
    const capped = !isNaN(amount) && amount > cap ? String(cap) : cleaned;
    setMyOfferStr(capped);
    scheduleOfferSubmit(capped);
  }

  function setQuickBet(amount: number) {
    const cap = isFreeMode ? molecules : balance;
    const capped = String(Math.min(amount, cap));
    setMyOfferStr(capped);
    scheduleOfferSubmit(capped);
  }

  function setMaxBet() {
    const cap = isFreeMode ? molecules : balance;
    setMyOfferStr(String(cap));
    scheduleOfferSubmit(String(cap));
  }

  function onQueue(betAmount: number) {
    matchmakingIntentRef.current = true;
    timedOutBattleRef.current = false;
    setQueueTimedOut(false);
    setQueueSecs(0);
    setQueueSession((s) => s + 1);
    setLockedBet(betAmount);
    setPhase("queued");
    setIsPending(true);
    pslCaptures.current = [];
    autoJudgeDone.current = false;
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          matchmakingIntentRef.current = false;
          setPhase("idle");
          return;
        }
        if (isFreeMode) {
          await queueForFreeMatch(token, betAmount);
        } else {
          await queueForBattle(token, betAmount);
        }
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
    router.push("/dashboard");
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
        if (isFreeMode) {
          await finalizeFreeMatchResult(token, { matchId: match.id, aiScoreP1: p1Total, aiScoreP2: p2Total });
        } else {
          await finalizeMatchResult(token, { matchId: match.id, aiScoreP1: p1Total, aiScoreP2: p2Total });
        }
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
    autoJudgeDone.current = false;
    setMyPsl(null);
    setOppPsl(null);
    pslCaptures.current = [];
    refreshBalance();
  }

  const matchLeaveRisk =
    phase !== "done" &&
    match != null &&
    match.status !== "completed" &&
    match.status !== "cancelled" &&
    (match.status === "matched" ||
      match.status === "live" ||
      phase === "countdown" ||
      phase === "analyzing" ||
      phase === "verdict");

  const { setMatchAtRisk } = useArenaMatchLeaveSetters();
  useWarnBeforeUnloadIf(phase !== "idle" && matchLeaveRisk);

  useEffect(() => {
    if (phase === "idle") {
      setMatchAtRisk(false);
      return;
    }
    setMatchAtRisk(matchLeaveRisk);
    return () => setMatchAtRisk(false);
  }, [phase, matchLeaveRisk, setMatchAtRisk]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (phase === "idle") {
    return <IdleScreen onQueue={onQueue} isPending={isPending} balance={balance} molecules={molecules} isFreeMode={isFreeMode} onModeChange={setIsFreeMode} />;
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

      <ArenaTopBar
        balance={balance}
        findRemain={isQueued && !queueTimedOut ? findRemain : null}
        mediaError={mediaError}
      />

      {!queueTimedOut && phase === "queued" && (
        <CompactYourBetStrip
          myOffer={myOfferStr}
          balance={isFreeMode ? molecules : balance}
          isFreeMode={isFreeMode}
          onOfferChange={onOfferChange}
          onQuickBet={setQuickBet}
          onMaxBet={setMaxBet}
          displayMyOffer={displayMyOffer}
        />
      )}

      {!queueTimedOut && phase === "negotiating" && match && (
        <ThePotNegotiationStrip
          match={match}
          timeLeft={timeLeft}
          myOffer={myOfferStr}
          balance={isFreeMode ? molecules : balance}
          isFreeMode={isFreeMode}
          onOfferChange={onOfferChange}
          onQuickBet={setQuickBet}
          onMaxBet={setMaxBet}
          displayMyOffer={displayMyOffer}
          displayOppOffer={displayOppOffer}
        />
      )}

      {/* Split screen — Omegle-style; mobile stacks with VS between */}
      <div className="relative z-10 flex-1 grid grid-cols-1 items-stretch md:grid-cols-[1fr_120px_1fr] gap-3 px-2 md:px-3 pt-1 md:pt-2">
        {/* LEFT — Opponent */}
        <div className="flex min-h-0 flex-col gap-2 order-1 md:h-full">
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
            isFreeMode={isFreeMode}
            pslBadge={oppPsl}
          />
          {showAnalysis && (
            <div className="md:hidden">
              <MetricsList metrics={METRICS} metricScores={metricScores} revealedMetrics={revealedMetrics} side="p2" isP1={isP1} />
            </div>
          )}
        </div>

        {/* CENTER — VS + status (VS vertically centered between panels on desktop) */}
        <div className="order-2 flex min-h-0 flex-col items-center justify-center gap-3 py-2 md:min-h-0 md:self-stretch md:py-2">
          <GlowingVS large={isQueued && !queueTimedOut} />
          <div className="hidden md:flex w-full flex-col items-center">
            <CenterColumn
              phase={phase}
              countdown={countdown}
              metricScores={metricScores}
              revealedMetrics={revealedMetrics}
              isP1={isP1}
            />
          </div>
        </div>

        {/* RIGHT — You */}
        <div className="flex min-h-0 flex-col gap-3 order-3 md:h-full">
          <PlayerPanel
            side="you"
            name={yourHandle}
            queueMonogram={yourMonogram}
            videoTrack={localVideoTrack}
            hasVideo={videoEnabled || localPreviewOnly}
            displayOffer={displayMyOffer}
            isTyping={false}
            phase={phase}
            isReady={myReady}
            score={isP1 ? myScore : oppScore}
            isSearching={false}
            queueTimedOut={queueTimedOut}
            pslBadge={myPsl}
            isFreeMode={isFreeMode}
          />

          {/* Ready button during live */}
          {phase === "live" && !myReady && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => { setMyReady(true); setOppReady(true); }}
              className="w-full py-5 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-base sm:text-lg shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all min-h-[60px]"
            >
              ⚔️ Begin AI Judgment
            </motion.button>
          )}

          {phase === "live" && myReady && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={startAnalysis}
              className="w-full py-5 bg-red-600 text-white font-black uppercase tracking-widest text-base sm:text-lg shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all min-h-[60px]"
            >
              <span className="flex items-center justify-center gap-2">
                <Swords className="size-5 sm:size-6" /> SCAN FACES
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
              onQueue(lockedBet);
            }}
            onBackToArena={backToArenaLanding}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {noFaceWarning && phase === "live" && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 border-2 border-red-500 bg-black/95 px-4 py-3 shadow-[0_0_30px_rgba(239,68,68,0.4)]"
          >
            <span className="text-red-400 text-lg">⚠️</span>
            <p className="text-sm font-black uppercase tracking-widest text-red-300">
              Show your face — no face detected, you will forfeit!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Done overlay */}
      <AnimatePresence>
        {isDone && (
          <DoneOverlay
            iWon={iWon}
            betAmount={match?.bet_amount ?? 0}
            myScore={myScore}
            oppScore={oppScore}
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
  molecules,
  isFreeMode,
  onModeChange,
}: {
  onQueue: (betAmount: number) => void;
  isPending: boolean;
  balance: number;
  molecules: number;
  isFreeMode: boolean;
  onModeChange: (free: boolean) => void;
}) {
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const idleStreamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [betStr, setBetStr] = useState("1");

  const cap = isFreeMode ? molecules : balance;
  const betNum = Math.min(Math.max(1, parseInt(betStr, 10) || 1), cap);

  // Camera — iOS-safe: simple constraints, explicit play()
  useEffect(() => {
    if (!camOn) return;
    const constraints: MediaStreamConstraints = {
      video: { facingMode: "user" },
      audio: true,
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        idleStreamRef.current = stream;
        const vid = idleVideoRef.current;
        if (vid) {
          vid.srcObject = stream;
          vid.play().catch(() => {});
        }
        setCamError(null);
      })
      .catch((err) => {
        setCamOn(false);
        if (err?.name === "NotAllowedError") {
          setCamError("Camera & mic permission denied — allow both to play.");
        } else if (err?.name === "NotFoundError") {
          setCamError("No camera or mic found on this device.");
        } else {
          setCamError("Camera & mic unavailable.");
        }
      });
    return () => {
      idleStreamRef.current?.getTracks().forEach((t) => t.stop());
      idleStreamRef.current = null;
    };
  }, [camOn]);

  function validateAndQueue() {
    if (!camOn) { setCamError("Enable your camera & mic first."); return; }
    const video = idleVideoRef.current;
    const stream = idleStreamRef.current;
    if (!stream || stream.getTracks().every((t) => t.readyState === "ended")) {
      setCamError("Camera & mic disconnected."); return;
    }
    const hasVideo = stream.getVideoTracks().some((t) => t.readyState === "live");
    const hasAudio = stream.getAudioTracks().some((t) => t.readyState === "live");
    if (!hasVideo || !hasAudio) {
      setCamError("Camera & mic both required to play."); return;
    }
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCamError("Camera not ready — wait a moment."); return;
    }
    if (betNum < 1 || betNum > cap) { setCamError(`Bet must be 1–${cap}.`); return; }
    setCamError(null);
    onQueue(betNum);
  }

  const accentColor = isFreeMode ? "cyan" : "fuchsia";

  return (
    <div className="w-full flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-6 px-4 py-8">
      {/* Title */}
      <div className="text-center space-y-1">
        <h1
          className="text-4xl md:text-6xl font-black uppercase text-white leading-none"
          style={{ textShadow: "0 0 40px rgba(168,85,247,0.8)", fontFamily: "var(--font-ibm-plex-mono)" }}
        >
          ENTER <span className="text-fuchsia-400">ARENA</span>
        </h1>
        <p className="text-zinc-600 text-xs uppercase tracking-widest">1v1 · face-off · bet your balance</p>
      </div>

      {/* Step 1 — Pick currency */}
      <div className="w-full max-w-sm space-y-2">
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold">Step 1 — Choose currency</p>
        <div className="grid grid-cols-2 gap-3">
          {/* MOG Coins */}
          <button
            onClick={() => onModeChange(false)}
            className={`relative flex flex-col items-center gap-2 border-2 px-4 py-5 transition-all ${
              !isFreeMode ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-white/10 bg-zinc-950 hover:border-white/20"
            }`}
          >
            {!isFreeMode && <div className="absolute top-2 right-2 size-2 rounded-full bg-fuchsia-400" />}
            <Zap className={`size-7 ${!isFreeMode ? "text-fuchsia-400" : "text-zinc-600"}`} />
            <p className={`text-sm font-black uppercase tracking-widest ${!isFreeMode ? "text-white" : "text-zinc-500"}`}>MOG Coins</p>
            <p className={`text-[11px] font-mono ${!isFreeMode ? "text-fuchsia-300" : "text-zinc-600"}`}>{balance.toLocaleString()} MC</p>
            {!isFreeMode && balance < 1 && (
              <a href="/wallet" className="text-[10px] text-red-400 underline">Deposit →</a>
            )}
          </button>

          {/* Molecules */}
          <button
            onClick={() => onModeChange(true)}
            className={`relative flex flex-col items-center gap-2 border-2 px-4 py-5 transition-all ${
              isFreeMode ? "border-cyan-500 bg-cyan-500/10" : "border-white/10 bg-zinc-950 hover:border-white/20"
            }`}
          >
            {isFreeMode && <div className="absolute top-2 right-2 size-2 rounded-full bg-cyan-400" />}
            <Atom className={`size-7 ${isFreeMode ? "text-cyan-400" : "text-zinc-600"}`} />
            <p className={`text-sm font-black uppercase tracking-widest ${isFreeMode ? "text-white" : "text-zinc-500"}`}>Molecules</p>
            <p className={`text-[11px] font-mono ${isFreeMode ? "text-cyan-300" : "text-zinc-600"}`}>{molecules.toLocaleString()} mol</p>
            {isFreeMode && molecules < 1 && (
              <a href="/spin" className="text-[10px] text-cyan-400 underline">Spin to earn →</a>
            )}
          </button>
        </div>
      </div>

      {/* Step 2 — Set bet */}
      <div className="w-full max-w-sm space-y-2">
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold">Step 2 — Set your bet</p>
        <div className={`border-2 px-4 py-3 ${accentColor === "cyan" ? "border-cyan-500/40" : "border-fuchsia-500/40"} bg-zinc-950`}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={cap}
              value={betStr}
              onChange={(e) => setBetStr(e.target.value.replace(/\D/g, ""))}
              className={`flex-1 bg-transparent text-2xl font-black text-center text-white tabular-nums focus:outline-none border-b-2 pb-1 ${accentColor === "cyan" ? "border-cyan-500/50" : "border-fuchsia-500/50"}`}
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            />
            <span className={`text-sm font-black uppercase ${accentColor === "cyan" ? "text-cyan-400" : "text-fuchsia-400"}`}>
              {isFreeMode ? "mol" : "MC"}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5 justify-center flex-wrap">
            {[1, 5, 10, 25].map((n) => (
              <button
                key={n}
                type="button"
                disabled={cap < n}
                onClick={() => setBetStr(String(n))}
                className={`border px-2.5 py-1 text-[10px] font-black uppercase disabled:opacity-30 ${accentColor === "cyan" ? "border-cyan-500/40 text-cyan-300 hover:border-cyan-400" : "border-fuchsia-500/40 text-fuchsia-300 hover:border-fuchsia-400"}`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={cap < 1}
              onClick={() => setBetStr(String(cap))}
              className="border border-orange-500/60 bg-orange-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-orange-300 disabled:opacity-30"
            >
              MAX
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-zinc-500">
            Balance <span className={`font-black tabular-nums ${accentColor === "cyan" ? "text-cyan-300" : "text-fuchsia-300"}`}>{cap.toLocaleString()} {isFreeMode ? "mol" : "MC"}</span>
            {" · "}matched with same bet only
          </p>
        </div>
      </div>

      {/* Step 3 — Camera */}
      <div className="w-full max-w-sm space-y-2">
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold">Step 3 — Enable camera</p>
        <div className={`relative w-full h-44 border-2 overflow-hidden bg-zinc-950 ${camOn ? (accentColor === "cyan" ? "border-cyan-500/50" : "border-fuchsia-500/50") : "border-white/10"}`}>
          {camOn ? (
            <>
              <video ref={idleVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 px-2 py-0.5">
                <motion.span className="size-1.5 rounded-full bg-red-500" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                <span className="text-[10px] font-mono text-red-400 font-bold uppercase">Live</span>
              </div>
            </>
          ) : (
            <button
              onClick={() => setCamOn(true)}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors group"
            >
              <div className={`size-12 border flex items-center justify-center transition-colors ${accentColor === "cyan" ? "border-cyan-500/40 group-hover:border-cyan-400" : "border-fuchsia-500/40 group-hover:border-fuchsia-400"}`}>
                <Swords className={`size-5 transition-colors ${accentColor === "cyan" ? "text-cyan-500/60 group-hover:text-cyan-400" : "text-fuchsia-500/60 group-hover:text-fuchsia-400"}`} />
              </div>
              <span className={`text-[11px] font-black uppercase tracking-widest transition-colors ${accentColor === "cyan" ? "text-zinc-600 group-hover:text-cyan-400" : "text-zinc-600 group-hover:text-fuchsia-400"}`}>
                Tap to enable camera & mic
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Fight button */}
      <div className="w-full max-w-sm space-y-2">
        <motion.button
          onClick={validateAndQueue}
          disabled={isPending || cap < 1 || betNum < 1}
          whileTap={{ scale: 0.97 }}
          className={`w-full h-14 font-black text-base uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            isFreeMode
              ? "bg-cyan-500 text-black hover:bg-cyan-400"
              : "bg-fuchsia-500 text-black hover:bg-fuchsia-400"
          }`}
        >
          {isPending ? (
            <><Loader2 className="size-5 animate-spin" /> Finding {betNum} {isFreeMode ? "mol" : "MC"} match…</>
          ) : (
            <><Swords className="size-5" /> Fight — {betNum} {isFreeMode ? "mol" : "MC"}</>
          )}
        </motion.button>

        {camError && (
          <p className="text-xs text-red-400 font-bold uppercase tracking-widest text-center">{camError}</p>
        )}
      </div>

      {/* Grid bg */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage: "linear-gradient(#a855f7 1px, transparent 1px), linear-gradient(90deg, #a855f7 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

// ─── PSL HUD ─────────────────────────────────────────────────────────────────

function PslHud({ base, isYou }: { base: number; isYou: boolean }) {
  const [display, setDisplay] = useState(base);

  useEffect(() => {
    const id = setInterval(() => {
      const delta = (Math.random() - 0.5) * 4; // ±2 points
      setDisplay(+(Math.max(1, Math.min(10, base + delta)).toFixed(1)));
    }, 1200);
    return () => clearInterval(id);
  }, [base]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`absolute top-2 right-2 z-10 flex flex-col items-center bg-black/85 border px-2 py-1 ${isYou ? "border-fuchsia-500/70" : "border-cyan-500/70"}`}
    >
      <span className={`text-[9px] font-black uppercase tracking-widest ${isYou ? "text-fuchsia-400" : "text-cyan-400"}`}>PSL</span>
      <motion.span
        key={display}
        initial={{ y: -4, opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-lg font-black tabular-nums text-white leading-none"
        style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
      >
        {display.toFixed(1)}
      </motion.span>
      <div className="mt-0.5 w-full h-0.5 bg-zinc-800 overflow-hidden">
        <motion.div
          className={`h-full ${isYou ? "bg-fuchsia-500" : "bg-cyan-400"}`}
          animate={{ width: `${(display / 10) * 100}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </motion.div>
  );
}

function ArenaTopBar({
  balance,
  findRemain,
  mediaError,
}: {
  balance: number;
  findRemain: number | null;
  mediaError: string | null;
}) {
  return (
    <div className="relative z-10 border-b border-white/10 bg-black/90 backdrop-blur-md">
      <div className="flex items-center gap-2 px-2 py-2 sm:px-4 sm:py-2.5">
      <span
        className="shrink-0 text-sm sm:text-base md:text-lg font-black tracking-tight text-white uppercase"
        style={{
          fontFamily: "var(--font-ibm-plex-mono)",
          textShadow: "0 0 20px rgba(168,85,247,0.85)",
        }}
      >
        OMOGGER
      </span>
      <div className="min-w-0 flex-1 flex justify-center px-1">
        {findRemain !== null && (
          <motion.span
            key={findRemain}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            className="truncate text-center text-[10px] sm:text-sm md:text-base font-black uppercase tracking-wide text-cyan-300"
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              textShadow: "0 0 14px rgba(34,211,238,0.55)",
            }}
          >
            Finding opponent...{" "}
            <span className="tabular-nums text-white">{findRemain}s</span>
          </motion.span>
        )}
      </div>
      <div
        className="shrink-0 flex items-center gap-1 rounded border border-fuchsia-500/30 bg-fuchsia-500/5 px-1.5 py-0.5 sm:px-2 sm:py-1"
        style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
      >
        <span className="text-xs sm:text-sm" aria-hidden>
          💰
        </span>
        <span className="font-black tabular-nums text-white text-[10px] sm:text-xs">{balance.toLocaleString()}</span>
        <span className="hidden sm:inline text-[9px] font-black uppercase text-zinc-500">MC</span>
      </div>
      </div>
      {mediaError && (
        <div
          className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[11px] font-bold text-amber-200"
          role="alert"
        >
          {mediaError}
        </div>
      )}
    </div>
  );
}

function CompactYourBetStrip({
  myOffer,
  balance,
  isFreeMode,
  onOfferChange,
  onQuickBet,
  onMaxBet,
  displayMyOffer,
}: {
  myOffer: string;
  balance: number;
  isFreeMode: boolean;
  onOfferChange: (val: string) => void;
  onQuickBet: (n: number) => void;
  onMaxBet: () => void;
  displayMyOffer: string;
}) {
  const myNum = parseInt(displayMyOffer, 10) || 0;
  const overBalance = myNum > balance;
  const unit = isFreeMode ? "mol" : "MC";
  const accent = isFreeMode ? "fuchsia" : "fuchsia";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 mx-auto flex w-full max-w-md flex-col items-stretch gap-2 px-3 py-3 sm:max-w-lg"
    >
      <div className={`border bg-black/90 px-3 py-2.5 shadow-[0_0_24px_rgba(168,85,247,0.12)] ${isFreeMode ? "border-cyan-500/35" : "border-fuchsia-500/35"}`}>
        <p
          className={`text-center text-[11px] font-black uppercase tracking-[0.35em] ${isFreeMode ? "text-cyan-300" : "text-fuchsia-300"}`}
          style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
        >
          Your bet
        </p>
        <p
          className="text-center text-xl font-black tabular-nums text-white sm:text-2xl"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 16px rgba(34,211,238,0.35)" }}
        >
          {myNum} {unit}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {[1, 5, 10].map((n, i) => (
            <span key={n} className="flex items-center gap-1.5">
              {i > 0 && <span className={`select-none ${isFreeMode ? "text-cyan-600" : "text-fuchsia-600"}`}>•</span>}
              <button
                type="button"
                onClick={() => onQuickBet(n)}
                disabled={balance < n}
                className={`border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-200 disabled:opacity-30 ${isFreeMode ? "hover:border-cyan-500/50" : "hover:border-fuchsia-500/50"}`}
              >
                {n} {unit}
              </button>
            </span>
          ))}
          <span className={`select-none ${isFreeMode ? "text-cyan-600" : "text-fuchsia-600"}`}>•</span>
          <button
            type="button"
            onClick={onMaxBet}
            disabled={balance < 1}
            className="border border-orange-500/60 bg-orange-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-orange-200 hover:bg-orange-500/25 disabled:opacity-30"
          >
            Max
          </button>
        </div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={myOffer}
          onChange={(e) => onOfferChange(e.target.value)}
          placeholder="0"
          className={`mt-2 w-full border bg-zinc-950 py-1.5 text-center text-sm font-black text-white placeholder-zinc-700 focus:outline-none tabular-nums ${isFreeMode ? "border-cyan-500/30 focus:border-cyan-400" : "border-fuchsia-500/30 focus:border-fuchsia-400"}`}
          style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
        />
        {overBalance && (
          <p className="mt-1 text-center text-[10px] font-bold text-red-400">Max {balance} {unit}</p>
        )}
        <p className="mt-1.5 text-center text-[10px] text-zinc-500">
          Balance <span className="font-black text-cyan-300 tabular-nums">{balance} {unit}</span>
        </p>
      </div>
    </motion.div>
  );
}

function PotMergeBurst({ perPlayer, potTotal }: { perPlayer: number; potTotal: number }) {
  return (
    <div className="relative flex h-24 w-full items-center justify-center overflow-hidden sm:h-28">
      <motion.span
        className="absolute left-[8%] font-black tabular-nums text-cyan-300 sm:left-[12%] sm:text-lg"
        style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 12px rgba(34,211,238,0.8)" }}
        initial={{ x: 0, opacity: 1, scale: 1 }}
        animate={{ x: "28vw", opacity: 0, scale: 0.4 }}
        transition={{ duration: 0.85, ease: "easeInOut" }}
      >
        {perPlayer} MC
      </motion.span>
      <motion.span
        className="absolute right-[8%] font-black tabular-nums text-fuchsia-300 sm:right-[12%] sm:text-lg"
        style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 12px rgba(217,70,239,0.8)" }}
        initial={{ x: 0, opacity: 1, scale: 1 }}
        animate={{ x: "-28vw", opacity: 0, scale: 0.4 }}
        transition={{ duration: 0.85, ease: "easeInOut" }}
      >
        {perPlayer} MC
      </motion.span>
      <motion.div
        className="relative z-10 text-center font-black tabular-nums text-amber-300 sm:text-3xl"
        style={{
          fontFamily: "var(--font-ibm-plex-mono)",
          textShadow: "0 0 28px rgba(251,191,36,0.9), 0 0 48px rgba(250,204,21,0.4)",
        }}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.75, type: "spring", stiffness: 380, damping: 22 }}
      >
        {potTotal} MC
      </motion.div>
    </div>
  );
}

function ThePotNegotiationStrip({
  match,
  timeLeft,
  myOffer,
  balance,
  isFreeMode,
  onOfferChange,
  onQuickBet,
  onMaxBet,
  displayMyOffer,
  displayOppOffer,
}: {
  match: MatchRow;
  timeLeft: number;
  myOffer: string;
  balance: number;
  isFreeMode: boolean;
  onOfferChange: (val: string) => void;
  onQuickBet: (n: number) => void;
  onMaxBet: () => void;
  displayMyOffer: string;
  displayOppOffer: string;
}) {
  const p1 = match.player1_bet_offer ?? null;
  const p2 = match.player2_bet_offer ?? null;
  const myNum = parseInt(displayMyOffer, 10) || 0;
  const oppNum = parseInt(displayOppOffer, 10) || 0;
  const agreed = p1 !== null && p2 !== null && p1 === p2 && p1 > 0;
  const perPlayer = agreed ? p1 : null;
  const potTotal = agreed ? p1 * 2 : null;
  const overBalance = myNum > balance;
  const unit = isFreeMode ? "mol" : "MC";

  const [mergeKey, setMergeKey] = useState(0);
  const prevAgreed = useRef(false);
  useEffect(() => {
    if (agreed && !prevAgreed.current) setMergeKey((k) => k + 1);
    prevAgreed.current = agreed;
  }, [agreed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 mx-auto w-full max-w-md px-3 py-3 sm:max-w-lg"
    >
      <div className="border-2 border-amber-500/45 bg-black/95 px-3 py-3 shadow-[0_0_32px_rgba(245,158,11,0.12)]">
        <h2
          className="text-center text-lg font-black uppercase tracking-[0.2em] text-amber-300 sm:text-xl"
          style={{
            fontFamily: "var(--font-ibm-plex-mono)",
            textShadow: "0 0 18px rgba(251,191,36,0.55)",
          }}
        >
          The pot
        </h2>
        <p
          className={`mt-1 text-center text-[10px] font-black uppercase tracking-widest ${timeLeft <= 3 ? "text-red-400" : "text-zinc-500"}`}
        >
          {agreed ? "Bets merged — heading live" : `Negotiate · ${timeLeft}s left`}
        </p>

        {!agreed && (
          <>
            <div className="mt-2 flex justify-center gap-6 text-[11px] font-mono sm:text-xs">
              <span className="text-cyan-300">You {myNum || "—"}</span>
              <span className="text-fuchsia-300">Opp {oppNum || "—"}</span>
            </div>
            {p1 !== null && p2 !== null && p1 !== p2 && (
              <p className="text-center text-[10px] font-bold uppercase tracking-wider text-yellow-500">
                Same amount both sides to fill the pot
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {[1, 5, 10].map((n, i) => (
                <span key={n} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-amber-700/80 select-none">•</span>}
                  <button
                    type="button"
                    onClick={() => onQuickBet(n)}
                    disabled={balance < n}
                    className="border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-200 hover:border-amber-500/40 disabled:opacity-30"
                  >
                    {n} {unit}
                  </button>
                </span>
              ))}
              <span className="text-amber-700/80 select-none">•</span>
              <button
                type="button"
                onClick={onMaxBet}
                disabled={balance < 1}
                className="border border-orange-500/60 bg-orange-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-orange-200 disabled:opacity-30"
              >
                Max
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={myOffer}
              onChange={(e) => onOfferChange(e.target.value)}
              placeholder="0"
              className="mt-2 w-full border border-amber-500/30 bg-zinc-950 py-1.5 text-center text-sm font-black text-white focus:border-amber-400 focus:outline-none tabular-nums"
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            />
            {overBalance && (
              <p className="mt-1 text-center text-[10px] font-bold text-red-400">Capped at {balance} {unit}</p>
            )}
          </>
        )}

        {agreed && perPlayer !== null && potTotal !== null && (
          <div className="mt-2">
            <PotMergeBurst key={mergeKey} perPlayer={perPlayer} potTotal={potTotal} />
            <p className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-amber-200/90">
              Winner takes {potTotal} {unit}
            </p>
          </div>
        )}

        <div className="mt-3 h-1 w-full overflow-hidden rounded bg-zinc-900">
          <motion.div
            className={`h-full ${timeLeft <= 3 ? "bg-red-500" : "bg-amber-500"}`}
            animate={{ width: `${(timeLeft / 10) * 100}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>
    </motion.div>
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
            className="py-4 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all min-h-[52px]"
          >
            TRY AGAIN
          </button>
          <button
            type="button"
            onClick={() => void onBackToArena()}
            className="py-4 border border-cyan-500/50 bg-cyan-500/5 text-cyan-300 font-black uppercase tracking-widest text-sm hover:bg-cyan-500/15 transition-colors min-h-[52px]"
          >
            HOME
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
  pslBadge = null,
  isFreeMode = false,
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
  pslBadge?: number | null;
  isFreeMode?: boolean;
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

  const showTypeHint = isYou && (phase === "queued" || phase === "negotiating");

  return (
    <div
      className={`relative flex h-full min-h-[18rem] flex-col border-2 md:h-[26rem] md:min-h-0 ${accentCss.border} ${accentCss.glow} bg-black/90 overflow-hidden`}
    >
      {/* Giant bet / input readout — above video (fixed block height both sides) */}
      {showHeroNumber && (
        <div className="relative z-[1] flex min-h-[5rem] shrink-0 flex-col justify-center border-b border-white/10 bg-gradient-to-b from-zinc-950 to-black px-2 py-2 md:min-h-[6rem] md:py-3">
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
                  fontSize: "clamp(1.5rem, 5vw, 2.5rem)",
                  lineHeight: 1,
                  textShadow: isYou
                    ? "0 0 28px rgba(168,85,247,0.85), 0 0 56px rgba(236,72,153,0.35)"
                    : "0 0 28px rgba(6,182,212,0.85), 0 0 48px rgba(168,85,247,0.25)",
                }}
              >
                {heroValue || (isYou ? "0" : "—")}
              </span>
              {(phase === "queued" || phase === "negotiating" || !!displayOffer) && (
                <span className={`text-sm font-black uppercase ${accentCss.text} opacity-50`}>{isFreeMode ? "mol" : "MC"}</span>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-1 flex min-h-[1.5rem] items-start justify-center">
            {showTypeHint ? (
              <p className="text-center text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-pink-400">
                Type digits - locked to your balance
              </p>
            ) : (
              <span className="invisible text-[10px] sm:text-xs font-black uppercase tracking-[0.2em]" aria-hidden>
                Type digits - locked to your balance
              </span>
            )}
          </div>
        </div>
      )}

      <div className="relative min-h-[10rem] flex-1 bg-zinc-950 md:min-h-[12rem]">
        <div
          ref={videoRef}
          className={`absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover${isYou ? " [&>video]:scale-x-[-1]" : ""}`}
        />

        {showVideo && (
          <FaceMeshCanvas
            containerRef={videoRef}
            mirrored={isYou}
          />
        )}

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
                  <p className="text-xs text-zinc-500 uppercase tracking-widest text-center px-2">
                    Allow camera &amp; mic — you&apos;ll see the match channel once connected
                  </p>
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
                  <p className="text-xs text-zinc-500 uppercase tracking-widest px-4 text-center">
                    Cam &amp; mic live — settle the pot
                  </p>
                )}
                {phase === "live" && !videoTrack && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <WifiOff className="size-3.5" />
                    <span>Connecting camera &amp; mic…</span>
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
        {pslBadge !== null && pslBadge > 0 && (
          <PslHud base={pslBadge} isYou={isYou} />
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
  metricScores,
  revealedMetrics,
  isP1,
}: {
  phase: ArenaPhase;
  countdown: number;
  metricScores: { p1: number; p2: number }[];
  revealedMetrics: number[];
  isP1: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-start gap-4 pt-2 w-full">
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
            className="py-4 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-sm sm:text-base shadow-[3px_3px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all min-h-[52px]"
          >
            Rematch
          </button>
          <button
            onClick={onDashboard}
            className="py-4 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-black uppercase tracking-widest text-sm sm:text-base transition-colors min-h-[52px]"
          >
            Dashboard
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
