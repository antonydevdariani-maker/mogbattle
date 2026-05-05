"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken, useDynamicContext } from "@dynamic-labs/sdk-react-core";
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
  submitMyPslScore,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useVonageVideo } from "@/components/match/vonage-video";
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
  Maximize2,
  Minimize2,
} from "lucide-react";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
type ArenaAiResult = { psl: number; tier?: string; strengths?: string; failos?: string } | null;
type ArenaPhase =
  | "idle"
  | "queued"
  | "negotiating"
  | "live"
  | "countdown"
  | "analyzing"
  | "verdict"
  | "overtime"
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

const DOM_TRAITS = [
  "Facial Structure", "Jawline Definition", "Skin Clarity", "Eye Area",
  "Hair Quality", "Symmetry", "Physique", "Style / Fashion", "Grooming", "Confidence",
];
const FLAW_TRAITS = [
  "Skin Texture", "Acne / Blemishes", "Uneven Tone", "Hair Health",
  "Posture", "Facial Fat", "Grooming Habits", "Style Fit", "Sleep / Eye Bags",
];

function formatQueueHandle(username: string | null, wallet: string | null): string {
  const w = wallet?.trim();
  if (w && w.length >= 8) {
    const core = w.startsWith("0x") ? w.slice(2) : w;
    if (core.length >= 8) {
      return `${core.slice(0, 4).toUpperCase()}…${core.slice(-4).toUpperCase()}`;
    }
  }
  const u = username?.trim() || "MOGGER";
  return u.length > 14 ? u.slice(0, 13) + "…" : u;
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
  isFounder = false,
}: {
  initialBalance: number;
  initialMolecules?: number;
  initialMatch: MatchRow | null;
  initialOpponentName: string | null;
  userId: string;
  displayName: string | null;
  walletAddress: string | null;
  isFounder?: boolean;
}) {
  const {  } = useDynamicContext();
  const authToken = getAuthToken();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);

  const [match, setMatch] = useState<MatchRow | null>(initialMatch);
  const [opponentName, setOpponentName] = useState<string | null>(initialOpponentName);
  const [balance, setBalance] = useState(initialBalance);
  const [myOfferStr, setMyOfferStr] = useState("");
  const [_timeLeft, setTimeLeft] = useState(10);
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
  const [isFreeMode, setIsFreeMode] = useState(initialMatch?.is_free_match ?? false);
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
  const overtimeDone = useRef(false);
  const [overtimeSecs, setOvertimeSecs] = useState(5);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const resultWaitRef = useRef<((r: { p1Total: number; p2Total: number }) => void) | null>(null);
  const myVideoContainerRef = useRef<HTMLDivElement>(null);
  const oppVideoContainerRef = useRef<HTMLDivElement>(null);
  const [noFaceWarning, setNoFaceWarning] = useState(false);
  const [tikTokMode, setTikTokMode] = useState(false);
  const [oppIsFounder, setOppIsFounder] = useState(false);
  const lastResultRef = useRef<{ p1Total: number; p2Total: number } | null>(null);

  // ── Post-match rematch signaling ──────────────────────────────────────────────
  const [myRematchReady, setMyRematchReady] = useState(false);
  const [oppRematchReady, setOppRematchReady] = useState(false);

  // Full AI results for PSL card overlays on camera feeds
  const [myAiResult, setMyAiResult] = useState<ArenaAiResult>(null);
  const [oppAiResult, setOppAiResult] = useState<ArenaAiResult>(null);

  // Live DOM/FLAW displayed during battle (updates each capture)
  const [myLiveDom, setMyLiveDom] = useState<string | null>(null);
  const [myLiveFlaw, setMyLiveFlaw] = useState<string | null>(null);
  const [oppLiveDom, setOppLiveDom] = useState<string | null>(null);
  const [oppLiveFlaw, setOppLiveFlaw] = useState<string | null>(null);

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

  // Auto-exit fullscreen when analysis begins
  useEffect(() => {
    if (phase !== "live") setTikTokMode(false);
  }, [phase]);

  const isP1 = match?.player1_id === userId;
  // Derive from match row so it survives page reload
  const resolvedFreeMode = match?.is_free_match ?? isFreeMode;
  const myRawOffer = isP1 ? match?.player1_bet_offer : match?.player2_bet_offer;
  const oppRawOffer = isP1 ? match?.player2_bet_offer : match?.player1_bet_offer;
  const displayMyOffer = myOfferStr || (myRawOffer ? String(myRawOffer) : "") || (lockedBet > 0 ? String(lockedBet) : "");
  const displayOppOffer = oppRawOffer ? String(oppRawOffer) : (match?.bet_amount ? String(match.bet_amount) : "");

  const myScore = isP1 ? scoreP1 : scoreP2;
  const oppScore = isP1 ? scoreP2 : scoreP1;
  const iWon = match?.winner_id
    ? match.winner_id === userId
    : myScore !== null && oppScore !== null && Math.abs(myScore - oppScore) >= 0.1
    ? myScore > oppScore
    : false;

  /** Full channel participation — needs a match ID. */
  const videoEnabled =
    !!match?.id &&
    ["queued", "negotiating", "live", "countdown", "analyzing", "verdict", "done"].includes(phase);

  /** Local cam/mic preview starts as soon as user enters queue, before match ID is assigned. */
  const localPreviewOnly = phase !== "idle" && !videoEnabled;

  // Vonage streams attach directly to DOM — no track refs needed
  const localVideoTrack = null;
  const remoteVideoTrack = null;
  const mediaError: string | null = null;

  const { startPreview: vonagePreview, connect: vonageConnect, disconnect: vonageDisconnect, opponentLeft } = useVonageVideo();

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    const token = authToken;
    if (!token) return;
    const p = await loadProfileSummary(token);
    setBalance(p?.total_credits ?? 0);
    setMolecules(p?.molecules ?? 0);
  }, [authToken]);

  const poll = useCallback(async () => {
    const token = authToken;
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
  }, [authToken, derivePhase]);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === "idle" || phase === "done") return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [phase, poll]);

  useEffect(() => {
    if (!match?.id) return;
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
        if (payload.userId !== userId) {
          setOppPsl(payload.psl);
          if (payload.dom) setOppLiveDom(payload.dom);
          if (payload.flaw) setOppLiveFlaw(payload.flaw);
        }
      })
      .on("broadcast", { event: "presence" }, ({ payload }) => {
        if (payload.userId !== userId && payload.isFounder) {
          setOppIsFounder(true);
        }
      })
      .on("broadcast", { event: "result" }, ({ payload }) => {
        // P2 receives P1's authoritative final scores
        if (!isP1) {
          lastResultRef.current = payload;
          setScoreP1(payload.p1Total);
          setScoreP2(payload.p2Total);
          setPhase((prev) => ["analyzing", "verdict", "done"].includes(prev) ? "done" : prev);
          resultWaitRef.current?.(payload);
          resultWaitRef.current = null;
        }
      })
      .on("broadcast", { event: "rematch" }, ({ payload }) => {
        if (payload.userId !== userId) {
          setOppRematchReady(true);
        }
      })
      .subscribe(() => {
        // Broadcast founder status so opponent can see badge
        if (isFounder) {
          setTimeout(() => {
            channel.send({ type: "broadcast", event: "presence", payload: { userId, isFounder: true } });
          }, 800);
        }
      });
    realtimeChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, isP1, refreshBalance, poll, userId]);

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

  // Start local camera preview as soon as user enters queue
  useEffect(() => {
    if (phase === "queued" || phase === "negotiating") {
      vonagePreview();
    }
  }, [phase, vonagePreview]);

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
      const token = authToken;
      if (token) {
        try {
          await cancelWaitingMatch(token);
        } catch {
          /* ignore */
        }
      }
      setMatch(null);
    });
  }, [queueTimedOut, phase, authToken]);

  // Live PSL loop — captures every 1.5s during battle, broadcasts psl+dom+flaw so both players see live changes
  useEffect(() => {
    if (phase !== "live") return;
    let cancelled = false;

    async function captureAndJudge(): Promise<{ psl: number; dom?: string; flaw?: string } | null> {
      try {
        const container = myVideoContainerRef.current;
        const video = container?.querySelector("video") as HTMLVideoElement | null;
        if (!video || video.videoWidth === 0) return null;
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 270;
        const ctx = canvas.getContext("2d")!;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, 480, 270);
        const base64 = canvas.toDataURL("image/jpeg", 0.9);
        const res = await fetch("/api/judge-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        const data = await res.json();
        if (!data.psl || data.psl <= 0) return null;
        // Pick one dom + one flaw from predefined lists; use API values if available
        const dom = (data.strengths && data.strengths !== "n/a")
          ? data.strengths
          : DOM_TRAITS[Math.floor(Math.random() * DOM_TRAITS.length)];
        const flaw = (data.failos && data.failos !== "none" && data.failos !== "n/a")
          ? data.failos
          : FLAW_TRAITS[Math.floor(Math.random() * FLAW_TRAITS.length)];
        return { psl: data.psl as number, dom, flaw };
      } catch { return null; }
    }

    async function runLoop() {
      await new Promise((r) => setTimeout(r, 1200));
      let round = 0;
      while (!cancelled) {
        const result = await captureAndJudge();
        if (cancelled) break;
        if (result) {
          const { psl, dom, flaw } = result;
          pslCaptures.current.push(psl);
          setMyPsl(psl);
          if (dom) setMyLiveDom(dom);
          if (flaw) setMyLiveFlaw(flaw);
          realtimeChannelRef.current?.send({
            type: "broadcast", event: "psl",
            payload: { userId, psl, dom, flaw },
          });
          if (round >= 1) {
            const best = Math.max(...pslCaptures.current);
            const token = authToken;
            if (token && match?.id) {
              try { await submitMyPslScore(token, { matchId: match.id, psl: best }); } catch { /* non-fatal */ }
            }
          }
        }
        round++;
        autoJudgeDone.current = round >= 2;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    void runLoop();
    return () => { cancelled = true; };
  }, [phase, match?.id, userId, authToken]);

  // Connect Vonage once when match goes live — do NOT disconnect on phase change
  // (countdown/analyzing/verdict all need the video still running)
  useEffect(() => {
    if (phase !== "live" || !match?.id) return;
    let cancelled = false;
    fetch(`/api/vonage-token?matchId=${match.id}`)
      .then((r) => r.json())
      .then((creds) => {
        if (!cancelled) vonageConnect(creds);
      })
      .catch((err) => console.error("[Video] token fetch error:", err));
    return () => { cancelled = true; };
  }, [phase, match?.id, vonageConnect]);

  // Streams stay alive through the done screen. Disconnect only happens via
  // handleBackToArena(), handleDashboard(), or the mutual-rematch effect below.

  // When both players signal rematch, tear down current session and re-queue.
  useEffect(() => {
    if (!myRematchReady || !oppRematchReady || phase !== "done") return;
    vonageDisconnect();
    resetArena();
    // Small delay so resetArena's state updates propagate before queuing.
    setTimeout(() => onQueue(lockedBet), 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRematchReady, oppRematchReady, phase]);

  // Auto-start analysis 3s after match goes live
  useEffect(() => {
    if (phase !== "live") return;
    setMyReady(true);
    setOppReady(true);
    const t = setTimeout(() => { void startAnalysis(); }, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // No opponent video after 15s → draw (fair — can't judge if can't see)
  useEffect(() => {
    if (phase !== "live" || !isP1) return;
    const drawTimer = setTimeout(() => {
      const remoteVideo = document.querySelector("#vonage-remote-video video") as HTMLVideoElement | null;
      if (!remoteVideo || remoteVideo.videoWidth === 0) {
        const drawScore = 5.0;
        setScoreP1(drawScore);
        setScoreP2(drawScore);
        realtimeChannelRef.current?.send({
          type: "broadcast", event: "result",
          payload: { p1Total: drawScore, p2Total: drawScore, draw: true },
        });
        setPhase("verdict");
        void (async () => {
          await pause(2800);
          setPhase("done");
          if (match && authToken) {
            const isFreeDraw = match.is_free_match ?? isFreeMode;
            if (isFreeDraw) {
              await finalizeFreeMatchResult(authToken, { matchId: match.id, aiScoreP1: drawScore, aiScoreP2: drawScore });
            } else {
              await finalizeMatchResult(authToken, { matchId: match.id, aiScoreP1: drawScore, aiScoreP2: drawScore });
            }
            refreshBalance();
          }
        })();
      }
    }, 15000);
    return () => clearTimeout(drawTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isP1]);

  // Face presence check — warn at 5s, auto-forfeit (score 0) at 10s if no face
  useEffect(() => {
    if (phase !== "live") return;

    async function hasFace(): Promise<boolean> {
      try {
        const container = myVideoContainerRef.current;
        const video = container?.querySelector("video") as HTMLVideoElement | null;
        if (!video || video.videoWidth === 0) return false;
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0, 320, 180);
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
        realtimeChannelRef.current?.send({
          type: "broadcast", event: "psl",
          payload: { userId, psl: 0 },
        });
        const token = authToken;
        if (token && match?.id) {
          try {
            await submitMyPslScore(token, { matchId: match.id, psl: 0 });
          } catch {
            /* non-fatal */
          }
        }
      } else {
        setNoFaceWarning(false);
      }
    }, 10000);

    return () => { clearTimeout(warnTimer); clearTimeout(forfeitTimer); };
  }, [phase, localVideoTrack, match?.id, userId, authToken]);

  // Keyboard number input during negotiation only — bet is locked once queued
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
  }, [phase, match?.id, balance, match?.status]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function scheduleOfferSubmit(val: string) {
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    const amount = parseInt(val, 10);
    if (!amount || amount < 1 || !match?.id || match.status !== "matched") return;
    const capped = isFreeMode ? Math.min(amount, molecules) : Math.min(amount, balance);
    submitTimerRef.current = setTimeout(async () => {
      const token = authToken;
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
        const token = authToken;
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
    const token = authToken;
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

  async function judgeContainer(containerRef: React.RefObject<HTMLDivElement | null>, mirror = false): Promise<ArenaAiResult> {
    const video = containerRef.current?.querySelector("video");
    if (!video || !video.videoWidth) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext("2d")!;
      if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, 480, 270);
      const base64 = canvas.toDataURL("image/jpeg", 0.9);
      const res = await fetch("/api/judge-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json() as { psl?: number; tier?: string; strengths?: string; failos?: string };
      if (!data.psl || data.psl <= 0) return null;
      return {
        psl: Number(data.psl.toFixed(2)),
        tier: data.tier ?? undefined,
        strengths: data.strengths ?? undefined,
        failos: data.failos ?? undefined,
      };
    } catch { return null; }
  }

  async function startAnalysis() {
    if (analysisRunning.current) return;
    analysisRunning.current = true;
    setTikTokMode(false);

    setPhase("countdown");
    for (let i = 3; i >= 1; i--) { setCountdown(i); await pause(900); }

    setPhase("analyzing");
    setRevealedMetrics([]);
    setMetricScores([]);

    // P1 fires both AI calls immediately — DOM capture works for both local and remote video
    const p1JudgePromise = isP1 ? judgeContainer(myVideoContainerRef, true) : Promise.resolve(null);
    const p2JudgePromise = isP1 ? judgeContainer(oppVideoContainerRef, false) : Promise.resolve(null);

    const scores: { p1: number; p2: number }[] = [];
    for (let i = 0; i < METRICS.length; i++) {
      await pause(1400 + Math.random() * 700);
      const ms = { p1: 5 + Math.random() * 5, p2: 5 + Math.random() * 5 };
      scores.push(ms);
      setMetricScores([...scores]);
      setRevealedMetrics((prev) => [...prev, i]);
    }

    await pause(900);

    if (isP1) {
      // Wait for both AI results — already running in parallel with animation
      const [p1Result, p2Result] = await Promise.all([p1JudgePromise, p2JudgePromise]);

      // AI PSL is canonical. Only fall back to metric avg if AI returned nothing.
      const metricAvgP1 = Number((scores.reduce((a, s) => a + s.p1, 0) / scores.length).toFixed(2));
      const metricAvgP2 = Number((scores.reduce((a, s) => a + s.p2, 0) / scores.length).toFixed(2));
      const p1Total = p1Result?.psl ?? metricAvgP1;
      const p2Total = p2Result?.psl ?? metricAvgP2;

      // Store full results for PSL card overlays
      setMyAiResult(p1Result);
      setOppAiResult(p2Result);

      // Update live PSL HUDs with canonical values
      setMyPsl(p1Total);
      setOppPsl(p2Total);
      setScoreP1(p1Total);
      setScoreP2(p2Total);

      // Overtime: if tied on first attempt, give 5 more seconds then re-analyze
      if (Math.abs(p1Total - p2Total) < 0.01 && !overtimeDone.current) {
        overtimeDone.current = true;
        analysisRunning.current = false;
        setPhase("overtime");
        setOvertimeSecs(5);
        for (let i = 5; i >= 1; i--) {
          setOvertimeSecs(i);
          await pause(1000);
        }
        setPhase("live");
        setMyReady(true);
        setOppReady(true);
        pslCaptures.current = [];
        await pause(400);
        await startAnalysis();
        return;
      }

      // Broadcast canonical result — send twice to guarantee delivery
      const resultPayload = { p1Total, p2Total };
      realtimeChannelRef.current?.send({ type: "broadcast", event: "result", payload: resultPayload });
      await pause(1500);
      realtimeChannelRef.current?.send({ type: "broadcast", event: "result", payload: resultPayload });

      setPhase("verdict");
      await pause(2800);
      setPhase("done");

      if (match) {
        startTransition(async () => {
          const token = authToken;
          if (!token) return;
          const isFree = match.is_free_match ?? isFreeMode;
          if (isFree) {
            await finalizeFreeMatchResult(token, { matchId: match.id, aiScoreP1: p1Total, aiScoreP2: p2Total });
          } else {
            await finalizeMatchResult(token, { matchId: match.id, aiScoreP1: p1Total, aiScoreP2: p2Total });
          }
          refreshBalance();
        });
      }
    } else {
      // P2: fire AI analysis on both cameras concurrently while waiting for P1's broadcast
      const myJudgePromise = judgeContainer(myVideoContainerRef, true);
      const oppJudgePromise = judgeContainer(oppVideoContainerRef, false);

      setPhase("verdict");
      const received = await new Promise<{ p1Total: number; p2Total: number } | null>((resolve) => {
        // Broadcast may have arrived before we got here — use cached value immediately
        if (lastResultRef.current) { resolve(lastResultRef.current); return; }
        resultWaitRef.current = resolve;
        setTimeout(() => {
          resultWaitRef.current = null;
          resolve(lastResultRef.current); // use cached result if it arrived during wait
        }, 12000);
      });

      // Collect AI results (have had 12s to run during the wait)
      const [myResult, oppResult] = await Promise.all([myJudgePromise, oppJudgePromise]);
      if (myResult) setMyAiResult(myResult);
      if (oppResult) setOppAiResult(oppResult);

      if (received) {
        // Scores already set by broadcast listener — update HUDs too
        setMyPsl(received.p2Total);
        setOppPsl(received.p1Total);
        setPhase("done");
      } else {
        // Fallback only if broadcast never arrived
        const myCaptures = pslCaptures.current;
        const p2Total = myCaptures.length > 0 ? Number(Math.max(...myCaptures).toFixed(2)) : Number((scores.reduce((a, s) => a + s.p2, 0) / scores.length).toFixed(2));
        const p1Total = oppPsl !== null ? Number(oppPsl.toFixed(2)) : Number((scores.reduce((a, s) => a + s.p1, 0) / scores.length).toFixed(2));
        setScoreP1(p1Total);
        setScoreP2(p2Total);
        setPhase("done");
      }
    }
  }

  /** Signal to the opponent that we want a rematch. If they already signaled,
   *  the mutual-rematch effect fires automatically. */
  function handleRematchSignal() {
    setMyRematchReady(true);
    realtimeChannelRef.current?.send({
      type: "broadcast",
      event: "rematch",
      payload: { userId },
    });
  }

  /** Disconnect streams and return to the idle lobby — no navigation. */
  function handleBackToArena() {
    vonageDisconnect();
    resetArena();
  }

  /** Disconnect streams and navigate to the dashboard. */
  function handleDashboard() {
    vonageDisconnect();
    router.push("/dashboard");
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
    overtimeDone.current = false;
    setMyPsl(null);
    setOppPsl(null);
    pslCaptures.current = [];
    setOvertimeSecs(5);
    lastResultRef.current = null;
    setMyRematchReady(false);
    setOppRematchReady(false);
    setMyAiResult(null);
    setOppAiResult(null);
    setMyLiveDom(null);
    setMyLiveFlaw(null);
    setOppLiveDom(null);
    setOppLiveFlaw(null);
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

      {/* Bet is locked before queue — no mid-match bet change UI */}

      {/* Split screen — Omegle-style; mobile stacks with VS between */}
      <div className="relative z-10 flex-1 grid grid-cols-1 items-stretch md:grid-cols-[1fr_120px_1fr] gap-3 px-2 md:px-3 pt-1 md:pt-2">
        {/* LEFT — You */}
        <div className="flex min-h-0 flex-col gap-3 order-1 md:h-full">
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
            isFounder={isFounder}
            videoContainerRef={myVideoContainerRef}
            rematchReady={myRematchReady}
            aiResult={myAiResult}
            liveDom={myLiveDom}
            liveFlaw={myLiveFlaw}
          />

          {/* AI auto-judges 3s after match goes live — no manual buttons needed */}
          {phase === "live" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full py-3 text-center text-xs font-black uppercase tracking-widest text-zinc-500"
            >
              AI judging in 3s…
            </motion.div>
          )}

          {/* TikTok fullscreen button */}
          {phase === "live" && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setTikTokMode(true)}
              className="w-full py-2 border border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 font-black uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Maximize2 className="size-3.5" /> Fullscreen
            </motion.button>
          )}

        </div>

        {/* CENTER — VS + status */}
        <div className="order-2 flex min-h-0 flex-col items-center justify-center gap-3 py-2 md:min-h-0 md:self-stretch md:py-2">
          <GlowingVS large={isQueued && !queueTimedOut} />
          <div className="hidden md:flex w-full flex-col items-center">
            <CenterColumn
              phase={phase}
              countdown={countdown}
              metricScores={metricScores}
              revealedMetrics={revealedMetrics}
              isP1={isP1}
              overtimeSecs={overtimeSecs}
            />
          </div>
        </div>

        {/* RIGHT — Opponent */}
        <div className="flex min-h-0 flex-col gap-2 order-3 md:h-full">
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
            videoContainerRef={oppVideoContainerRef}
            isFounder={oppIsFounder}
            rematchReady={oppRematchReady}
            aiResult={oppAiResult}
            liveDom={oppLiveDom}
            liveFlaw={oppLiveFlaw}
          />
        </div>
      </div>

      {/* Overtime overlay */}
      <AnimatePresence>
        {phase === "overtime" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.p
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="text-3xl font-black uppercase tracking-[0.25em] text-yellow-300"
              style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 30px rgba(234,179,8,0.9)" }}
            >
              OVERTIME
            </motion.p>
            <motion.p
              key={overtimeSecs}
              initial={{ scale: 1.4, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-7xl font-black tabular-nums text-white"
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            >
              {overtimeSecs}
            </motion.p>
            <p className="text-xs text-yellow-500/70 uppercase tracking-widest">Scores tied — sudden death</p>
          </motion.div>
        )}
      </AnimatePresence>

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
            isTie={myScore !== null && oppScore !== null && Math.abs(myScore - oppScore) < 0.1}
            betAmount={match?.bet_amount ?? 0}
            myScore={myScore}
            oppScore={oppScore}
            myPsl={myPsl}
            oppPsl={oppPsl}
            myAiResult={myAiResult}
            oppAiResult={oppAiResult}
            isFreeMode={resolvedFreeMode}
            myRematchReady={myRematchReady}
            oppRematchReady={oppRematchReady}
            opponentLeft={opponentLeft}
            onRematch={handleRematchSignal}
            onBackToArena={handleBackToArena}
            onDashboard={handleDashboard}
          />
        )}
      </AnimatePresence>

      {/* TikTok fullscreen overlay */}
      <AnimatePresence>
        {tikTokMode && phase === "live" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex"
          >
            <TikTokVideoPanel
              domId="vonage-remote-video"
              label={opponentName ?? "???"}
              accentColor="cyan"
              mirrored={false}
            />
            <TikTokVideoPanel
              domId="vonage-local-video"
              label="YOU"
              accentColor="fuchsia"
              mirrored
            />
            <button
              onClick={() => setTikTokMode(false)}
              className="absolute top-4 right-4 z-[210] flex items-center gap-1.5 border border-zinc-700 bg-black/80 px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-300 hover:text-white backdrop-blur-sm"
            >
              <Minimize2 className="size-4" /> Exit
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── TikTok Video Panel ───────────────────────────────────────────────────────

function TikTokVideoPanel({
  domId,
  label,
  accentColor,
  mirrored,
}: {
  domId: string;
  label: string;
  accentColor: "fuchsia" | "cyan";
  mirrored: boolean;
}) {
  const accent = accentColor === "fuchsia"
    ? { text: "text-fuchsia-300", border: "border-fuchsia-500/60" }
    : { text: "text-cyan-300", border: "border-cyan-500/60" };

  return (
    <div className="relative flex-1 h-full overflow-hidden bg-zinc-950">
      <div
        id={domId}
        className={`absolute inset-0 [&_div]:w-full [&_div]:h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover${mirrored ? " [&_video]:scale-x-[-1]" : ""}`}
      />
      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 border ${accent.border} bg-black/60 px-3 py-1 backdrop-blur-sm`}>
        <span className={`text-xs font-black uppercase tracking-widest ${accent.text}`}>{label}</span>
      </div>
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
    // Release idle camera before Agora acquires it, then queue after one frame
    idleStreamRef.current?.getTracks().forEach((t) => t.stop());
    idleStreamRef.current = null;
    setTimeout(() => onQueue(betNum), 150);
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
        <div className={`relative w-full h-44 border-2 rounded-xl overflow-hidden bg-zinc-950 ${camOn ? (accentColor === "cyan" ? "border-cyan-500/50" : "border-fuchsia-500/50") : "border-white/10"}`}>
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

// ─── PSL Card Overlay ────────────────────────────────────────────────────────

const TIER_INFO: Record<string, { icon: string; label: string; color: string }> = {
  chad:     { icon: "🔥", label: "CHAD",     color: "#e879f9" },
  chadlite: { icon: "⚜",  label: "CHADLITE", color: "#22d3ee" },
  htn:      { icon: "★",  label: "HTN",       color: "#86efac" },
  mtn:      { icon: "◈",  label: "MTN",       color: "#d4d4d8" },
  ltn:      { icon: "🌙", label: "LTN",       color: "#a1a1aa" },
  sub5:     { icon: "💀", label: "SUB5",      color: "#f87171" },
};

function ArenaPslCard({
  psl, tier, dom, flaw, label,
}: {
  psl: number | null; tier?: string; dom?: string; flaw?: string;
  label: "YOUR SCAN" | "ENEMY SCAN";
}) {
  const derived = psl !== null ? pslTier(psl) : null;
  const t = (tier ? TIER_INFO[tier] : null) ?? (derived ? { icon: "⚡", label: derived.label, color: derived.color } : null);
  const hasDom = dom && dom !== "n/a";
  const hasFlaw = flaw && flaw !== "none" && flaw !== "n/a";
  return (
    <div className="rounded-2xl bg-black/70 backdrop-blur-md px-3.5 py-3 space-y-2 min-w-[150px] max-w-[185px] border border-white/[0.10] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-400 leading-none">Overall Score</p>
        <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-zinc-500 leading-none">{label}</p>
      </div>
      {/* Live PSL number with bounce on change */}
      <AnimatePresence mode="wait">
        <motion.p
          key={psl?.toFixed(1) ?? "dash"}
          initial={{ scale: 1.25, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
          className="text-4xl font-black text-white tabular-nums leading-none"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: t ? `0 0 20px ${t.color}88` : "0 0 18px rgba(255,255,255,0.3)" }}
        >
          {psl !== null ? psl.toFixed(1) : "—"}
        </motion.p>
      </AnimatePresence>
      {/* Tier badge */}
      {t && (
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{t.icon}</span>
          <span className="text-[11px] font-black uppercase tracking-wider leading-none" style={{ color: t.color }}>{t.label}</span>
        </div>
      )}
      {/* DOM / Refinement */}
      {(hasDom || hasFlaw) && (
        <div className="space-y-1 pt-1.5 border-t border-white/[0.08]">
          {hasDom && (
            <div className="flex items-start gap-1.5">
              <span className="text-[8px] font-black uppercase text-emerald-400 shrink-0 mt-px leading-tight">🔷 DOM</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={dom}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="text-[9px] text-zinc-200 leading-tight line-clamp-1"
                >
                  {dom}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
          {hasFlaw && (
            <div className="flex items-start gap-1.5">
              <span className="text-[8px] font-black uppercase text-amber-400 shrink-0 mt-px leading-tight">🔶 REFINE</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={flaw}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="text-[9px] text-amber-200 leading-tight line-clamp-1"
                >
                  {flaw}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PSL Tier ────────────────────────────────────────────────────────────────

function pslTier(psl: number): { label: string; color: string } {
  if (psl >= 7.25) return { label: "ADAM LITE", color: "#f59e0b" };
  if (psl >= 6.0)  return { label: "CHAD", color: "#22d3ee" };
  if (psl >= 5.5)  return { label: "CHADLITE", color: "#a78bfa" };
  if (psl >= 4.25) return { label: "HTN", color: "#86efac" };
  if (psl >= 3.75) return { label: "MTN", color: "#d4d4d8" };
  if (psl >= 3.25) return { label: "LTN", color: "#a1a1aa" };
  return { label: "SB", color: "#f87171" };
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
          className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[11px] font-bold text-amber-200 flex items-center justify-center gap-3"
          role="alert"
        >
          <span>⚠ {mediaError}</span>
          <button
            onClick={() => window.location.reload()}
            className="text-[10px] font-black uppercase tracking-widest border border-amber-500/50 px-2 py-0.5 hover:bg-amber-500/20 transition-colors"
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
}

function PotMergeBurst({ perPlayer, potTotal, isFreeMode }: { perPlayer: number; potTotal: number; isFreeMode: boolean }) {
  const unit = isFreeMode ? "mol" : "MC";
  return (
    <div className="relative flex h-24 w-full items-center justify-center overflow-hidden sm:h-28">
      <motion.span
        className="absolute left-[8%] font-black tabular-nums text-cyan-300 sm:left-[12%] sm:text-lg"
        style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 12px rgba(34,211,238,0.8)" }}
        initial={{ x: 0, opacity: 1, scale: 1 }}
        animate={{ x: "28vw", opacity: 0, scale: 0.4 }}
        transition={{ duration: 0.85, ease: "easeInOut" }}
      >
        {perPlayer} {unit}
      </motion.span>
      <motion.span
        className="absolute right-[8%] font-black tabular-nums text-fuchsia-300 sm:right-[12%] sm:text-lg"
        style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 12px rgba(217,70,239,0.8)" }}
        initial={{ x: 0, opacity: 1, scale: 1 }}
        animate={{ x: "-28vw", opacity: 0, scale: 0.4 }}
        transition={{ duration: 0.85, ease: "easeInOut" }}
      >
        {perPlayer} {unit}
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
        {potTotal} {unit}
      </motion.div>
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
      className={`font-black text-white select-none ${large ? "text-5xl sm:text-6xl md:text-8xl" : "text-3xl sm:text-5xl md:text-6xl"}`}
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
  score: _score,
  isSearching = false,
  queueTimedOut = false,
  pslBadge = null,
  isFreeMode = false,
  isFounder = false,
  videoContainerRef,
  rematchReady = false,
  aiResult,
  liveDom,
  liveFlaw,
}: {
  side: "you" | "opponent";
  name: string;
  footerOverride?: string | null;
  queueMonogram?: string;
  videoTrack: null;
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
  isFounder?: boolean;
  videoContainerRef?: React.RefObject<HTMLDivElement | null>;
  rematchReady?: boolean;
  aiResult?: ArenaAiResult;
  liveDom?: string | null;
  liveFlaw?: string | null;
}) {
  const internalVideoRef = useRef<HTMLDivElement>(null);
  const videoRef = videoContainerRef ?? internalVideoRef;
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

  // Vonage streams attach to videoRef.current directly via OT.initPublisher / session.subscribe
  const showVideo = hasVideo;

  const heroPhases = ["queued", "negotiating"] as const;
  const showHeroNumber = heroPhases.includes(phase as (typeof heroPhases)[number]);

  const heroValue =
    isYou
      ? displayOffer || (phase === "queued" || phase === "negotiating" ? "" : "")
      : isSearching && !queueTimedOut
        ? "—"
        : displayOffer || (phase === "negotiating" ? "—" : "");

  const heroKey = isYou ? (displayOffer || "empty") : `${isSearching}-${displayOffer || "dash"}`;

  const showTypeHint = isYou && phase === "negotiating";

  return (
    <div
      className={`relative flex h-full min-h-[18rem] flex-col border-2 rounded-xl md:h-[26rem] md:min-h-0 ${accentCss.border} ${accentCss.glow} bg-black/90 overflow-hidden`}
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

      <div className="relative min-h-[12rem] flex-1 bg-zinc-950 md:min-h-[22rem]">
        <div
          ref={videoRef}
          id={isYou ? "vonage-local-video" : "vonage-remote-video"}
          className={`absolute inset-0 [&_div]:w-full [&_div]:h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover${!isYou ? " [&_video]:scale-x-[-1]" : ""}`}
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
        {showVideo && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/70 px-2 py-0.5 max-w-[70%]">
            {isFounder && (
              <span className="text-[8px] font-black uppercase tracking-widest text-yellow-400 border border-yellow-500/60 px-1 leading-tight">FOUNDER</span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wide truncate ${isYou ? "text-fuchsia-300" : "text-cyan-300"}`}>
              {footerText}
            </span>
            {pslBadge !== null && pslBadge > 0 && (
              <span className={`text-[10px] font-mono font-bold shrink-0 ${isYou ? "text-fuchsia-400" : "text-cyan-400"}`}>
                · {pslBadge.toFixed(1)}
              </span>
            )}
          </div>
        )}
        {/* PSL card — live from battle start, number bounces on each update */}
        {["live", "analyzing", "verdict", "done"].includes(phase) && showVideo && (
          <div className="absolute top-2 left-2 z-[100]">
            <ArenaPslCard
              psl={pslBadge ?? null}
              tier={aiResult?.tier}
              dom={liveDom ?? aiResult?.strengths}
              flaw={liveFlaw ?? aiResult?.failos}
              label={isYou ? "YOUR SCAN" : "ENEMY SCAN"}
            />
          </div>
        )}

        {/* Rematch-ready checkmark overlay — shown on both panels during done phase */}
        <AnimatePresence>
          {rematchReady && phase === "done" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-green-500/20 border-2 border-green-400/60"
            >
              <CheckCircle2 className="size-12 text-green-400" style={{ filter: "drop-shadow(0 0 12px rgba(74,222,128,0.9))" }} />
              <span className="text-xs font-black uppercase tracking-widest text-green-300">Rematch</span>
            </motion.div>
          )}
        </AnimatePresence>

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

      </div>

      <div className={`flex items-center justify-between px-3 py-2 border-t ${accentCss.border} bg-black gap-2`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {isFounder && (
            <span className="text-[8px] font-black uppercase tracking-widest text-yellow-400 border border-yellow-500/60 px-1 leading-tight shrink-0">FOUNDER</span>
          )}
          <span
            className={`text-[10px] sm:text-xs font-black uppercase tracking-widest truncate ${accentCss.text}`}
            style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
          >
            {footerText}
          </span>
          {pslBadge !== null && pslBadge > 0 && (
            <span className={`text-[10px] font-mono font-bold shrink-0 ${isYou ? "text-fuchsia-400" : "text-cyan-400"}`}>
              PSL {pslBadge.toFixed(1)}
            </span>
          )}
        </div>
        {isReady && phase !== "idle" && (
          <span className="flex items-center gap-1 text-xs text-green-400 font-bold shrink-0">
            <CheckCircle2 className="size-3" /> Ready
          </span>
        )}
        {!isReady && phase === "live" && (
          <span className="flex items-center gap-1 text-xs text-zinc-600 shrink-0">
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
  overtimeSecs,
}: {
  phase: ArenaPhase;
  countdown: number;
  metricScores: { p1: number; p2: number }[];
  revealedMetrics: number[];
  isP1: boolean;
  overtimeSecs?: number;
}) {
  return (
    <div className="flex flex-col items-center justify-start gap-4 pt-2 w-full">
      {/* Overtime indicator */}
      {phase === "overtime" && (
        <div className="flex flex-col items-center gap-1">
          <motion.p
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="text-sm font-black uppercase tracking-widest text-yellow-300"
            style={{ textShadow: "0 0 14px rgba(234,179,8,0.9)" }}
          >
            OVERTIME
          </motion.p>
          <motion.span
            key={overtimeSecs}
            initial={{ scale: 1.3, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl font-black tabular-nums text-yellow-400"
            style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
          >
            {overtimeSecs}
          </motion.span>
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
  isTie = false,
  betAmount,
  myScore,
  oppScore,
  myPsl,
  oppPsl,
  myAiResult,
  oppAiResult,
  isFreeMode = false,
  myRematchReady,
  oppRematchReady,
  opponentLeft,
  onRematch,
  onBackToArena,
  onDashboard,
}: {
  iWon: boolean;
  isTie?: boolean;
  betAmount: number;
  myScore: number | null;
  oppScore: number | null;
  myPsl: number | null;
  oppPsl: number | null;
  myAiResult: ArenaAiResult;
  oppAiResult: ArenaAiResult;
  isFreeMode?: boolean;
  myRematchReady: boolean;
  oppRematchReady: boolean;
  opponentLeft: boolean;
  onRematch: () => void;
  onBackToArena: () => void;
  onDashboard: () => void;
}) {
  const particles = (iWon || isTie)
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
    >
      {/* Confetti */}
      {particles.map((p, i) => (
        <Particle key={i} x={p.x} y={p.y} color={p.color} />
      ))}

      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 20, delay: 0.1 }}
        className={`relative w-full max-w-sm border-2 ${isTie ? "border-yellow-500" : iWon ? "border-fuchsia-500" : "border-red-500"} bg-black/60 backdrop-blur-md p-6 space-y-5 text-center`}
        style={{
          boxShadow: isTie
            ? "0 0 60px rgba(234,179,8,0.4)"
            : iWon
            ? "0 0 60px rgba(168,85,247,0.5), 0 0 120px rgba(168,85,247,0.2)"
            : "0 0 60px rgba(239,68,68,0.4)",
        }}
      >
        {/* Corner accents */}
        <div className={`absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 ${isTie ? "border-yellow-400" : iWon ? "border-cyan-400" : "border-red-400"}`} />
        <div className={`absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 ${isTie ? "border-yellow-400" : iWon ? "border-cyan-400" : "border-red-400"}`} />

        {/* Icon */}
        <div className="flex justify-center">
          {isTie ? (
            <Swords className="size-14 text-yellow-400" style={{ filter: "drop-shadow(0 0 16px rgba(234,179,8,0.8))" }} />
          ) : iWon ? (
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
            className={`text-4xl font-black uppercase tracking-tight ${isTie ? "text-yellow-200" : iWon ? "text-fuchsia-200" : "text-red-300"}`}
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              textShadow: isTie ? "0 0 30px rgba(234,179,8,0.8)" : iWon ? "0 0 30px rgba(168,85,247,0.8)" : "0 0 20px rgba(239,68,68,0.6)",
            }}
          >
            {isTie ? "DEAD HEAT" : iWon ? "YOU MOGGED HIM" : "YOU GOT MOGGED"}
          </motion.h2>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">
            {isTie ? "Identical PSL — bets refunded" : iWon ? "Facial superiority confirmed by AI" : "The numbers don't lie, king"}
          </p>
        </div>

        {/* PSL Cards */}
        <div className="grid grid-cols-2 gap-2">
          {/* YOUR card */}
          <div className={`border ${iWon && !isTie ? "border-fuchsia-500/60" : "border-zinc-800"} p-3 space-y-1 bg-black/40`}>
            <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-zinc-400">YOUR SCAN</p>
            <p className="text-3xl font-black tabular-nums text-white leading-none" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
              {(myAiResult?.psl ?? myPsl ?? myScore) !== null ? (myAiResult?.psl ?? myPsl ?? myScore)!.toFixed(1) : "—"}
            </p>
            {(() => { const v = myAiResult?.psl ?? myPsl ?? myScore; const t = v !== null ? pslTier(v) : null; return t ? <p className="text-[10px] font-black" style={{ color: t.color }}>{t.label}</p> : null; })()}
            {myAiResult?.strengths && myAiResult.strengths !== "n/a" && (
              <p className="text-[9px] text-green-400 truncate">+ {myAiResult.strengths}</p>
            )}
            {myAiResult?.failos && myAiResult.failos !== "none" && myAiResult.failos !== "n/a" && (
              <p className="text-[9px] text-red-400 truncate">- {myAiResult.failos}</p>
            )}
            {iWon && !isTie && <p className="text-[10px] text-fuchsia-400 font-black uppercase tracking-wide">WINNER</p>}
          </div>
          {/* OPP card */}
          <div className={`border ${!iWon && !isTie ? "border-cyan-500/60" : "border-zinc-800"} p-3 space-y-1 bg-black/40`}>
            <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-zinc-400">ENEMY SCAN</p>
            <p className="text-3xl font-black tabular-nums text-white leading-none" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
              {(oppAiResult?.psl ?? oppPsl ?? oppScore) !== null ? (oppAiResult?.psl ?? oppPsl ?? oppScore)!.toFixed(1) : "—"}
            </p>
            {(() => { const v = oppAiResult?.psl ?? oppPsl ?? oppScore; const t = v !== null ? pslTier(v) : null; return t ? <p className="text-[10px] font-black" style={{ color: t.color }}>{t.label}</p> : null; })()}
            {oppAiResult?.strengths && oppAiResult.strengths !== "n/a" && (
              <p className="text-[9px] text-green-400 truncate">+ {oppAiResult.strengths}</p>
            )}
            {oppAiResult?.failos && oppAiResult.failos !== "none" && oppAiResult.failos !== "n/a" && (
              <p className="text-[9px] text-red-400 truncate">- {oppAiResult.failos}</p>
            )}
            {!iWon && !isTie && <p className="text-[10px] text-cyan-400 font-black uppercase tracking-wide">WINNER</p>}
          </div>
        </div>

        {/* P&L */}
        {betAmount > 0 && (
          <div
            className={`border px-4 py-3 ${isTie ? "border-yellow-500/30 bg-yellow-500/10" : iWon ? "border-green-500/30 bg-green-500/10" : "border-red-500/20 bg-red-500/10"}`}
          >
            <p
              className={`text-3xl font-black tabular-nums ${isTie ? "text-yellow-300" : iWon ? "text-green-300" : "text-red-400"}`}
              style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
            >
              {isTie ? `±0` : iWon ? `+${(betAmount * 2).toLocaleString()}` : `-${betAmount.toLocaleString()}`} {isFreeMode ? "mol" : "MC"}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isTie ? "Bet refunded to both players" : iWon ? "Deposited to your balance" : "Taken by winner"}
            </p>
          </div>
        )}

        {/* Opponent left notice */}
        {opponentLeft && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-zinc-500 text-center uppercase tracking-widest"
          >
            Opponent has left the lobby
          </motion.p>
        )}

        {/* Buttons */}
        <div className="space-y-2">
          {/* Rematch row */}
          <button
            onClick={onRematch}
            disabled={myRematchReady}
            className={`w-full py-4 font-black uppercase tracking-widest text-sm sm:text-base transition-all min-h-[52px] ${
              myRematchReady
                ? oppRematchReady
                  ? "bg-green-500 text-black cursor-default"
                  : "bg-zinc-800 border border-green-500/50 text-green-400 cursor-default"
                : "bg-fuchsia-500 text-black shadow-[3px_3px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
            }`}
          >
            {myRematchReady
              ? oppRematchReady
                ? "Starting rematch…"
                : "Waiting for opponent…"
              : "Rematch"}
          </button>

          {/* Exit row */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onBackToArena}
              className="py-3 border border-cyan-500/50 bg-cyan-500/5 text-cyan-300 font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-cyan-500/15 transition-colors min-h-[44px]"
            >
              Back to Arena
            </button>
            <button
              onClick={onDashboard}
              className="py-3 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-black uppercase tracking-widest text-xs sm:text-sm transition-colors min-h-[44px]"
            >
              Dashboard
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
