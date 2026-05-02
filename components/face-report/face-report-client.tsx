"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import bs58 from "bs58";
import { motion, AnimatePresence } from "framer-motion";
import {
  buildFaceReportPaymentTx,
  verifyFaceReportPayment,
} from "@/app/actions";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RotateCcw,
  Scan,
  Star,
  AlertTriangle,
  Zap,
  TrendingUp,
  Shield,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureScore {
  score: number;
  notes: string;
  [key: string]: unknown;
}

interface FaceReport {
  psl: number;
  tier: string;
  overallVerdict: string;
  faceShape: string;
  symmetry: number;
  facialThirds: string;
  features: {
    eyes: FeatureScore & { canthalTilt: string; spacing: string; shape: string };
    nose: FeatureScore & { width: string; projection: string; tip: string };
    jaw: FeatureScore & { definition: string; gonialAngle: string; width: string };
    chin: FeatureScore & { projection: string; shape: string };
    cheekbones: FeatureScore & { prominence: string; width: string };
    lips: FeatureScore & { upperToLowerRatio: string; philtrum: string };
    skin: FeatureScore & { texture: string; visibleIssues: string[] };
    hair: FeatureScore;
  };
  strengths: string[];
  weaknesses: string[];
  improvements: {
    immediate: string[];
    noninvasive: string[];
    medical: string[];
  };
  photoQuality: string;
  confidenceScore: number;
}

type Phase = "capture-front" | "capture-side" | "preview" | "payment" | "paying" | "analyzing" | "report";

const TIER_LABELS: Record<string, string> = {
  sub5: "Below Average",
  ltn: "Low Tier Normal",
  mtn: "Mid Tier Normal",
  htn: "High Tier Normal",
  chadlite: "Chadlite",
  chad: "Chad",
};

const TIER_COLOR: Record<string, string> = {
  sub5: "text-red-400",
  ltn: "text-orange-400",
  mtn: "text-yellow-400",
  htn: "text-lime-400",
  chadlite: "text-cyan-400",
  chad: "text-fuchsia-400",
};

const MAINNET = "solana:mainnet" as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function captureFromVideo(video: HTMLVideoElement): string | null {
  if (!video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = Math.round((640 / video.videoWidth) * video.videoHeight);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = score >= 7 ? "bg-fuchsia-500" : score >= 5 ? "bg-cyan-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
        <span className="text-zinc-500">{label}</span>
        <span className="text-white tabular-nums">{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="border border-white/10 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Icon className="size-4 text-fuchsia-400 shrink-0" />
        <h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FaceReportClient() {
  const { getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("capture-front");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [report, setReport] = useState<FaceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payStep, setPayStep] = useState<"idle" | "building" | "signing" | "verifying">("idle");

  const solWallet = wallets[0] ?? null;

  // ── Camera ───────────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamOn(true);
    } catch {
      setError("Camera access required. Allow it in your browser settings.");
    }
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  function takePhoto(target: "front" | "side") {
    const video = videoRef.current;
    if (!video) return;
    const img = captureFromVideo(video);
    if (!img) return;
    if (target === "front") {
      setFrontImage(img);
      stopCamera();
      setPhase("capture-side");
    } else {
      setSideImage(img);
      stopCamera();
      setPhase("preview");
    }
  }

  function skipSide() {
    stopCamera();
    setPhase("preview");
  }

  function retake(target: "front" | "side") {
    if (target === "front") {
      setFrontImage(null);
      setSideImage(null);
      setPhase("capture-front");
    } else {
      setSideImage(null);
      setPhase("capture-side");
    }
  }

  // ── Payment ──────────────────────────────────────────────────────────────────

  async function runPayment() {
    setError(null);
    if (!solWallet || !walletsReady) {
      setError("Solana wallet not ready. Make sure you have a wallet connected.");
      return;
    }
    const token = await getAccessToken();
    if (!token) { setError("Not signed in."); return; }

    setPhase("paying");
    setPayStep("building");

    let signature: string;
    try {
      const { transactionBase64 } = await buildFaceReportPaymentTx(token, { ownerAddress: solWallet.address });
      setPayStep("signing");
      const txBytes = Uint8Array.from(Buffer.from(transactionBase64, "base64"));
      const result = await signAndSendTransaction({
        transaction: txBytes,
        wallet: solWallet,
        chain: MAINNET,
        options: { sponsor: true },
      });
      const sig = (result as { signature: unknown }).signature;
      signature = typeof sig === "string" ? sig : bs58.encode(sig as Uint8Array);
    } catch (e) {
      setPayStep("idle");
      setPhase("payment");
      setError(e instanceof Error ? e.message : "Transaction failed. Make sure you have $5 USDC in your wallet.");
      return;
    }

    // Wait for confirmation then verify
    setPayStep("verifying");
    await new Promise((r) => setTimeout(r, 3000));

    const verify = await verifyFaceReportPayment(token, { txSignature: signature });
    if (!verify.ok) {
      setPayStep("idle");
      setPhase("payment");
      setError(`Payment verification failed: ${verify.reason}`);
      return;
    }

    // Payment confirmed — run analysis
    setPayStep("idle");
    setPhase("analyzing");
    await runAnalysis();
  }

  async function runAnalysis() {
    try {
      const res = await fetch("/api/face-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImage, sideImage }),
      });
      if (!res.ok) throw new Error("Analysis request failed");
      const data = await res.json() as FaceReport & { error?: string };
      if (data.error) throw new Error(String(data.error));
      setReport(data);
      setPhase("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("payment"); // allow retry without re-paying
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const isCapturePhase = phase === "capture-front" || phase === "capture-side";

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 pb-12">

      {/* ── Capture Phase ── */}
      {isCapturePhase && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <p className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-400 font-bold">
              {phase === "capture-front" ? "Step 1 of 2" : "Step 2 of 2"}
            </p>
            <h2 className="text-xl font-black uppercase text-white" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
              {phase === "capture-front" ? "Front-Facing Photo" : "Side Profile Photo"}
            </h2>
            <p className="text-xs text-zinc-500">
              {phase === "capture-front"
                ? "Look straight at the camera, neutral expression, good lighting"
                : "Turn 90° to your left or right — show your full profile"}
            </p>
          </div>

          {/* Camera box */}
          <div className="relative w-full aspect-[3/4] border-2 border-fuchsia-500/40 bg-zinc-950 overflow-hidden">
            {camOn ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <div className="pointer-events-none absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-fuchsia-400" />
                <div className="pointer-events-none absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-fuchsia-400" />
                <div className="pointer-events-none absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-fuchsia-400" />
                <div className="pointer-events-none absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-fuchsia-400" />
                <div className="absolute bottom-4 inset-x-4 flex gap-2">
                  <button
                    onClick={() => takePhoto(phase === "capture-front" ? "front" : "side")}
                    className="flex-1 py-3 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-sm shadow-[3px_3px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                  >
                    Capture
                  </button>
                  {phase === "capture-side" && (
                    <button
                      onClick={skipSide}
                      className="px-4 py-3 border border-zinc-700 text-zinc-400 text-xs font-black uppercase tracking-widest hover:border-zinc-500 transition-colors"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                {phase === "capture-front" && frontImage === null && (
                  <div className="size-16 border border-zinc-700 flex items-center justify-center">
                    <Camera className="size-8 text-zinc-600" />
                  </div>
                )}
                <button
                  onClick={startCamera}
                  className="px-6 py-3 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-sm shadow-[3px_3px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                >
                  Open Camera
                </button>
                {phase === "capture-side" && (
                  <button onClick={skipSide} className="text-xs text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors">
                    Skip side photo
                  </button>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400 font-bold text-center">{error}</p>}

          {phase === "capture-side" && (
            <button onClick={() => retake("front")} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors mx-auto">
              <RotateCcw className="size-3" /> Retake front photo
            </button>
          )}
        </div>
      )}

      {/* ── Preview Phase ── */}
      {phase === "preview" && (
        <div className="space-y-4">
          <h2 className="text-center text-xl font-black uppercase text-white" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
            Review Photos
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest text-center">Front</p>
              <div className="relative aspect-[3/4] bg-zinc-900 overflow-hidden border border-white/10">
                {frontImage && <img src={frontImage} alt="front" className="w-full h-full object-cover" />}
              </div>
              <button onClick={() => retake("front")} className="w-full flex items-center justify-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors">
                <RotateCcw className="size-3" /> Retake
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest text-center">Side</p>
              <div className="relative aspect-[3/4] bg-zinc-900 overflow-hidden border border-white/10 flex items-center justify-center">
                {sideImage
                  ? <img src={sideImage} alt="side" className="w-full h-full object-cover" />
                  : <p className="text-[10px] text-zinc-700 uppercase tracking-widest">No side photo</p>
                }
              </div>
              {sideImage && (
                <button onClick={() => retake("side")} className="w-full flex items-center justify-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors">
                  <RotateCcw className="size-3" /> Retake
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => setPhase("payment")}
            className="w-full py-4 bg-fuchsia-500 text-black font-black uppercase tracking-widest shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center justify-center gap-2"
          >
            Continue to Payment <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* ── Payment Phase ── */}
      {phase === "payment" && (
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black uppercase text-white" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
              Unlock Your Report
            </h2>
            <p className="text-zinc-500 text-xs">One-time payment · Instant delivery</p>
          </div>

          {/* Price card */}
          <div className="border-2 border-fuchsia-500/50 bg-fuchsia-500/5 p-6 text-center space-y-2"
            style={{ boxShadow: "0 0 40px rgba(217,70,239,0.15)" }}>
            <p className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-400 font-bold">Price</p>
            <p className="text-5xl font-black text-white" style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 20px rgba(217,70,239,0.5)" }}>
              $5.00
            </p>
            <p className="text-xs text-zinc-500">USDC on Solana</p>
          </div>

          {/* What you get */}
          <div className="border border-white/10 bg-zinc-950 p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">What you get</p>
            {[
              "PSL score + tier classification",
              "Full feature-by-feature breakdown (8 categories)",
              "Facial symmetry + proportions analysis",
              "Your top strengths and weaknesses",
              "Actionable improvement plan (lifestyle → medical)",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-xs text-zinc-300">
                <CheckCircle2 className="size-3.5 text-fuchsia-400 shrink-0 mt-0.5" />
                {item}
              </div>
            ))}
          </div>

          {!solWallet && (
            <p className="text-xs text-amber-400 font-bold text-center border border-amber-500/30 bg-amber-500/10 p-3">
              ⚠ No Solana wallet found. Make sure you have an embedded wallet set up in your account.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 font-bold border border-red-500/30 bg-red-500/10 p-3">{error}</p>
          )}

          <button
            onClick={runPayment}
            disabled={!solWallet || !walletsReady}
            className="w-full py-4 bg-fuchsia-500 text-black font-black uppercase tracking-widest text-base shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0 flex items-center justify-center gap-2"
          >
            <Zap className="size-5" /> Pay $5 USDC &amp; Get Report
          </button>

          <p className="text-[10px] text-zinc-700 text-center">
            Payment goes to treasury wallet on Solana mainnet. Verified on-chain before report is generated.
          </p>
        </div>
      )}

      {/* ── Paying / Analyzing Phase ── */}
      {(phase === "paying" || phase === "analyzing") && (
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="size-16 border-2 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full"
          />
          <div className="text-center space-y-1">
            <p className="font-black uppercase tracking-widest text-white text-sm" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
              {phase === "analyzing" ? "Analyzing your face…" : payStep === "building" ? "Building transaction…" : payStep === "signing" ? "Waiting for signature…" : "Confirming on-chain…"}
            </p>
            <p className="text-xs text-zinc-600">
              {phase === "analyzing" ? "AI is processing your photos" : "Do not close this page"}
            </p>
          </div>
        </div>
      )}

      {/* ── Report Phase ── */}
      {phase === "report" && report && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Header */}
          <div className="border-2 border-fuchsia-500/60 bg-black p-6 text-center space-y-3"
            style={{ boxShadow: "0 0 60px rgba(217,70,239,0.2)" }}>
            <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
            <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />
            <p className="text-[10px] uppercase tracking-[0.35em] text-fuchsia-400 font-bold">PSL Score</p>
            <p className="text-7xl font-black tabular-nums text-white leading-none"
              style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 30px rgba(217,70,239,0.7)" }}>
              {report.psl?.toFixed(1) ?? "—"}
            </p>
            <p className={`text-sm font-black uppercase tracking-widest ${TIER_COLOR[report.tier] ?? "text-zinc-400"}`}>
              {TIER_LABELS[report.tier] ?? report.tier}
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">{report.overallVerdict}</p>
            <div className="flex items-center justify-center gap-3 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
              <span>Symmetry: {report.symmetry}%</span>
              <span>·</span>
              <span>Shape: {report.faceShape?.split(" ")[0]}</span>
              <span>·</span>
              <span>Confidence: {report.confidenceScore}%</span>
            </div>
          </div>

          {/* Feature scores */}
          <Section title="Feature Scores" icon={Scan}>
            <div className="space-y-3">
              {Object.entries(report.features ?? {}).map(([key, val]) => (
                <ScoreBar key={key} label={key} score={(val as FeatureScore).score} />
              ))}
            </div>
          </Section>

          {/* Feature details */}
          <Section title="Detailed Analysis" icon={Star}>
            <div className="space-y-3 divide-y divide-zinc-900">
              {Object.entries(report.features ?? {}).map(([key, val]) => {
                const f = val as FeatureScore;
                const extras = Object.entries(f).filter(([k]) => !["score", "notes"].includes(k));
                return (
                  <div key={key} className="pt-3 first:pt-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-black uppercase tracking-widest text-fuchsia-300 capitalize">{key}</p>
                      <span className="text-xs font-mono text-white tabular-nums">{f.score?.toFixed(1)}/10</span>
                    </div>
                    {extras.map(([k, v]) => (
                      <div key={k} className="flex gap-1 text-[10px] text-zinc-500">
                        <span className="capitalize shrink-0">{k}:</span>
                        <span className="text-zinc-400">{String(v)}</span>
                      </div>
                    ))}
                    {f.notes && <p className="text-[10px] text-zinc-500 mt-1 italic">{f.notes}</p>}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Facial proportions */}
          <Section title="Proportions" icon={TrendingUp}>
            <p className="text-xs text-zinc-400 leading-relaxed">{report.facialThirds}</p>
          </Section>

          {/* Strengths + Weaknesses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section title="Strengths" icon={CheckCircle2}>
              <div className="space-y-2">
                {(report.strengths ?? []).map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                    {s}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Weaknesses" icon={AlertTriangle}>
              <div className="space-y-2">
                {(report.weaknesses ?? []).map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                    {s}
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Improvement plan */}
          <Section title="Improvement Plan" icon={Shield}>
            <div className="space-y-4">
              {[
                { label: "Immediate (Free / Lifestyle)", items: report.improvements?.immediate ?? [], color: "text-green-400" },
                { label: "Non-Invasive", items: report.improvements?.noninvasive ?? [], color: "text-cyan-400" },
                { label: "Medical Options", items: report.improvements?.medical ?? [], color: "text-fuchsia-400" },
              ].map(({ label, items, color }) => items.length > 0 && (
                <div key={label}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${color} mb-2`}>{label}</p>
                  <div className="space-y-1.5">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                        <ChevronRight className="size-3 shrink-0 mt-0.5 text-zinc-600" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <button
            onClick={() => {
              setPhase("capture-front");
              setFrontImage(null);
              setSideImage(null);
              setReport(null);
              setError(null);
            }}
            className="w-full py-3 border border-zinc-700 text-zinc-400 font-black uppercase tracking-widest text-xs hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            New Analysis
          </button>
        </motion.div>
      )}
    </div>
  );
}
