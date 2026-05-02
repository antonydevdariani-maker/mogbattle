"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { claimDailySpin, loadSpinData } from "@/app/actions";
import { Atom, Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIZES = [50, 75, 100, 125, 150, 200, 250, 500];
const SEGMENT_COLORS = [
  "#a855f7", "#06b6d4", "#ec4899", "#f59e0b",
  "#10b981", "#6366f1", "#ef4444", "#fbbf24",
];

const TOTAL = 360;
const SEG = TOTAL / PRIZES.length; // 45deg each

function WheelCanvas({ rotation }: { rotation: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    const cx = size / 2;
    const r = cx - 4;
    ctx.clearRect(0, 0, size, size);

    PRIZES.forEach((prize, i) => {
      const startAngle = (i * SEG - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * SEG - 90) * (Math.PI / 180);

      ctx.beginPath();
      ctx.moveTo(cx, cx);
      ctx.arc(cx, cx, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = SEGMENT_COLORS[i];
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate((startAngle + endAngle) / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px monospace";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(`${prize}`, r - 8, 5);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cx, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, []);

  return (
    <motion.canvas
      ref={canvasRef}
      width={300}
      height={300}
      animate={{ rotate: rotation }}
      transition={{ duration: 4, ease: [0.17, 0.67, 0.12, 0.99] }}
      style={{ borderRadius: "50%" }}
    />
  );
}

function Countdown({ nextSpinAt }: { nextSpinAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, nextSpinAt - Date.now()));

  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, nextSpinAt - Date.now())), 1000);
    return () => clearInterval(id);
  }, [nextSpinAt]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="font-black tabular-nums" style={{ fontFamily: "var(--font-heading)" }}>
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function SpinClient() {
  const { getAccessToken, authenticated, ready } = usePrivy();
  const [molecules, setMolecules] = useState<number | null>(null);
  const [canSpin, setCanSpin] = useState(false);
  const [nextSpinAt, setNextSpinAt] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [prize, setPrize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalRotation = useRef(0);

  useEffect(() => {
    if (!ready || !authenticated) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const data = await loadSpinData(token);
      setMolecules(data.molecules);
      setCanSpin(data.canSpin);
      setNextSpinAt(data.nextSpinAt);
    })();
  }, [ready, authenticated, getAccessToken]);

  async function spin() {
    if (!canSpin || spinning) return;
    setSpinning(true);
    setError(null);
    setPrize(null);

    // Animate first — server will validate timing
    const spinAmount = 1800 + Math.random() * 1440; // 5-9 full rotations
    totalRotation.current += spinAmount;
    setRotation(totalRotation.current);

    await new Promise((r) => setTimeout(r, 4200)); // wait for animation

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      const result = await claimDailySpin(token);
      setPrize(result.prize);
      setMolecules(result.newMolecules);
      setCanSpin(false);
      setNextSpinAt(Date.now() + 24 * 60 * 60 * 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Spin failed");
    } finally {
      setSpinning(false);
    }
  }

  if (!ready || molecules === null) {
    return (
      <div className="flex min-h-[calc(100dvh-6rem)] items-center justify-center text-zinc-600 text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100dvh-6rem)] flex flex-col items-center justify-center gap-6 px-4 py-10 bg-black">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "linear-gradient(#a855f7 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Header */}
      <div className="relative text-center space-y-1">
        <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-cyan-400 font-bold">
          <Atom className="size-4" />
          Daily Molecule Spin
        </div>
        <h1 className="text-4xl font-black uppercase text-white" style={{ fontFamily: "var(--font-heading)", textShadow: "0 0 30px rgba(6,182,212,0.6)" }}>
          Spin &amp; Earn
        </h1>
        <p className="text-xs text-zinc-500">Once every 24 hours · Free to play · No real money</p>
      </div>

      {/* Molecule balance */}
      <div className="relative flex items-center gap-2 border border-cyan-500/30 bg-cyan-500/5 px-5 py-2.5">
        <Atom className="size-4 text-cyan-400" />
        <span className="font-black text-white tabular-nums text-lg" style={{ fontFamily: "var(--font-heading)" }}>
          {molecules.toLocaleString()}
        </span>
        <span className="text-xs text-zinc-500 uppercase font-bold">Molecules</span>
      </div>

      {/* Wheel */}
      <div className="relative">
        {/* Pointer */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-0 h-0"
          style={{ borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "22px solid #06b6d4" }}
        />
        <div className="relative rounded-full shadow-[0_0_60px_rgba(168,85,247,0.4)]">
          <WheelCanvas rotation={rotation} />
        </div>
      </div>

      {/* Spin button / countdown */}
      {canSpin ? (
        <motion.button
          onClick={spin}
          disabled={spinning}
          whileTap={{ scale: 0.96 }}
          className="relative w-48 h-14 bg-cyan-500 text-black font-black uppercase tracking-widest text-base shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {spinning ? "Spinning…" : "Spin!"}
        </motion.button>
      ) : (
        <div className="text-center space-y-1 border border-white/10 bg-zinc-950 px-8 py-4">
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 uppercase tracking-widest">
            <Timer className="size-3.5" />
            Next spin in
          </div>
          {nextSpinAt && <Countdown nextSpinAt={nextSpinAt} />}
        </div>
      )}

      {/* Prize reveal */}
      <AnimatePresence>
        {prize !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
            onClick={() => setPrize(null)}
          >
            <div className="relative border-2 border-cyan-400 bg-black p-10 text-center space-y-4 max-w-xs w-full"
              style={{ boxShadow: "0 0 80px rgba(6,182,212,0.5)" }}
            >
              <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-fuchsia-400" />
              <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-fuchsia-400" />
              <Atom className="mx-auto size-10 text-cyan-400" style={{ filter: "drop-shadow(0 0 12px rgba(6,182,212,0.8))" }} />
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-400 font-bold">You won</p>
              <p className="text-7xl font-black text-white tabular-nums" style={{ fontFamily: "var(--font-heading)", textShadow: "0 0 30px rgba(6,182,212,0.8)" }}>
                +{prize}
              </p>
              <p className="text-sm font-bold text-cyan-300 uppercase tracking-widest">Molecules</p>
              <p className="text-xs text-zinc-500">Balance: {molecules.toLocaleString()} molecules</p>
              <p className="text-[10px] text-zinc-700 mt-2">Tap anywhere to close</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-400 font-bold text-center max-w-xs">
          {error}
        </div>
      )}

      {/* Prize table */}
      <div className="relative w-full max-w-xs border border-white/10 bg-zinc-950">
        <div className="border-b border-white/10 px-4 py-2">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Prize Table</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-white/5">
          {PRIZES.map((p, i) => (
            <div key={p} className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="size-2.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i] }} />
                <span className="text-xs font-black text-white tabular-nums">{p}</span>
              </div>
              <span className="text-[10px] text-zinc-600">{[30,25,20,10,7,5,2,1][i]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
