"use client";

import { useEffect, useRef, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { motion, AnimatePresence } from "framer-motion";
import { claimDailySpin, loadSpinData } from "@/app/actions";
import { Atom, Timer } from "lucide-react";

const PRIZES = [50, 75, 100, 125, 150, 200, 250, 500];
const TOTAL = 360;
const SEG = TOTAL / PRIZES.length; // 45deg each

function WheelCanvas({ rotation, size = 260 }: { rotation: number; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const sz = canvas.width;
    const cx = sz / 2;
    const r = cx - 2;
    ctx.clearRect(0, 0, sz, sz);

    PRIZES.forEach((prize, i) => {
      const startAngle = (i * SEG - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * SEG - 90) * (Math.PI / 180);
      const isAlt = i % 2 === 0;

      ctx.beginPath();
      ctx.moveTo(cx, cx);
      ctx.arc(cx, cx, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = isAlt ? "#0d0d0d" : "#141414";
      ctx.fill();
      ctx.strokeStyle = "#2a2a2a";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate((startAngle + endAngle) / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = prize === 500 ? "#d946ef" : "#ffffff";
      ctx.font = `bold ${prize >= 200 ? "12px" : "13px"} monospace`;
      ctx.fillText(`${prize}`, r - 10, 5);
      ctx.restore();
    });

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cx, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#d946ef";
    ctx.fill();
  }, []);

  return (
    <motion.canvas
      ref={canvasRef}
      width={size}
      height={size}
      animate={{ rotate: rotation }}
      transition={{ duration: 4, ease: [0.17, 0.67, 0.12, 0.99] }}
      style={{ borderRadius: "50%", width: size, height: size }}
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
  const { authToken, isAuthenticated, sdkHasLoaded } = useDynamicContext();
  const [molecules, setMolecules] = useState<number | null>(null);
  const [canSpin, setCanSpin] = useState(false);
  const [nextSpinAt, setNextSpinAt] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [prize, setPrize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalRotation = useRef(0);

  useEffect(() => {
    if (!sdkHasLoaded || !isAuthenticated || !authToken) return;
    (async () => {
      const data = await loadSpinData(authToken);
      setMolecules(data.molecules);
      setCanSpin(data.canSpin);
      setNextSpinAt(data.nextSpinAt);
    })();
  }, [sdkHasLoaded, isAuthenticated, authToken]);

  async function spin() {
    if (!canSpin || spinning) return;
    setSpinning(true);
    setError(null);
    setPrize(null);

    try {
      
      if (!authToken) throw new Error("Not authenticated");

      // Claim prize first so wheel lands on the actual winning segment
      const result = await claimDailySpin(authToken);

      const prizeIndex = PRIZES.indexOf(result.prize);
      const targetDeg = (prizeIndex + 0.5) * SEG;
      const currentMod = ((totalRotation.current % 360) + 360) % 360;
      const diff = ((targetDeg - currentMod) + 360) % 360;
      totalRotation.current += 1800 + diff; // 5 full rotations + land on prize
      setRotation(totalRotation.current);

      await new Promise((r) => setTimeout(r, 4200));

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

  if (!sdkHasLoaded || molecules === null) {
    return (
      <div className="flex min-h-[calc(100dvh-6rem)] items-center justify-center text-zinc-600 text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col items-center justify-center gap-6 py-8" style={{ minHeight: "calc(100dvh - 8rem)" }}>
      {/* Balance */}
      <div className="flex items-center gap-1.5 border border-white/10 bg-white/5 px-3 py-1.5">
        <Atom className="size-3 text-cyan-400" />
        <span className="font-black text-white tabular-nums text-sm" style={{ fontFamily: "var(--font-heading)" }}>
          {molecules.toLocaleString()}
        </span>
        <span className="text-[10px] text-zinc-500 uppercase font-bold">mol</span>
      </div>

      {/* Wheel */}
      <div className="relative">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-0 h-0"
          style={{ borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "18px solid #06b6d4" }}
        />
        <div className="relative rounded-full shadow-[0_0_40px_rgba(168,85,247,0.3)]">
          <WheelCanvas rotation={rotation} size={260} />
        </div>
      </div>

      {/* Spin button / countdown */}
      {canSpin ? (
        <motion.button
          onClick={spin}
          disabled={spinning}
          whileTap={{ scale: 0.96 }}
          className="w-40 h-12 bg-cyan-500 text-black font-black uppercase tracking-widest text-sm shadow-[3px_3px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {spinning ? "Spinning…" : "Spin"}
        </motion.button>
      ) : (
        <div className="text-center space-y-1 border border-white/10 bg-zinc-950 px-6 py-3">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest">
            <Timer className="size-3" />
            Next spin in
          </div>
          {nextSpinAt && <Countdown nextSpinAt={nextSpinAt} />}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 font-bold text-center">{error}</p>
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
            <div className="relative border-2 border-cyan-400 bg-black p-8 text-center space-y-3 max-w-xs w-full"
              style={{ boxShadow: "0 0 60px rgba(6,182,212,0.5)" }}
            >
              <div className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-fuchsia-400" />
              <div className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-fuchsia-400" />
              <Atom className="mx-auto size-8 text-cyan-400" style={{ filter: "drop-shadow(0 0 10px rgba(6,182,212,0.8))" }} />
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">You won</p>
              <p className="text-6xl font-black text-white tabular-nums" style={{ fontFamily: "var(--font-heading)", textShadow: "0 0 20px rgba(6,182,212,0.8)" }}>
                +{prize}
              </p>
              <p className="text-xs font-bold text-cyan-300 uppercase tracking-widest">Molecules</p>
              <p className="text-[10px] text-zinc-600 mt-1">Tap to close</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
