"use client";

import { useState, useEffect } from "react";
import { Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { IntroAnimation } from "@/components/ui/intro-animation";

const LAUNCH_TIME = new Date("2026-05-07T10:00:00-04:00").getTime();
const PASSWORD = "Ticker";

function useCountdown(target: number) {
  const [diff, setDiff] = useState(target - Date.now());
  useEffect(() => {
    const id = setInterval(() => setDiff(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  const total = Math.max(0, diff);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  return { h, m, s, done: total === 0 };
}

// Jagged crack through the O in MOG (3rd char of centered OMOGGER ≈ 44% viewport)
const crack: [number, number][] = [
  [44.0, 0],
  [43.3, 7],
  [45.1, 14],
  [42.9, 21],
  [44.7, 28],
  [43.1, 35],
  [45.3, 42],
  [43.5, 49],
  [44.9, 56],
  [43.2, 63],
  [45.0, 70],
  [43.6, 77],
  [44.4, 84],
  [43.8, 91],
  [44.0, 100],
];

const crackPolyline = crack.map(([x, y]) => `${x},${y}`).join(" ");
// Purple clips to LEFT side of crack
const purpleClip = `polygon(0% 0%, ${crack.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 0% 100%)`;

export default function Home() {
  const router = useRouter();
  const { h, m, s, done } = useCountdown(LAUNCH_TIME);
  const [showModal, setShowModal] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

  function handleEnter() {
    if (input === PASSWORD) {
      router.push("/login");
    } else {
      setError(true);
      setInput("");
    }
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {!introDone && <IntroAnimation onDone={() => setIntroDone(true)} />}

      {/* ── YELLOW LAYER (left side / base) ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-yellow-500/40" />
        <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-yellow-500/40" />
        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-yellow-500/40" />
        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-yellow-500/40" />

        <main className="relative flex flex-col items-center text-center space-y-8 max-w-2xl w-full">
          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-yellow-500/40" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-yellow-500">Volume II</span>
            <div className="h-px w-12 bg-yellow-500/40" />
          </div>

          <div className="space-y-2">
            <h1
              className="text-7xl font-black uppercase tracking-tight leading-none md:text-9xl"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <span className="text-white">O</span>
              <span className="text-yellow-400">MOG</span>
              <span className="text-white">GER</span>
            </h1>
            <p className="text-zinc-600 text-xs uppercase tracking-[0.4em] font-bold">1v1 Face-Off Arena</p>
          </div>

          <p className="text-zinc-400 text-base max-w-md leading-relaxed">
            Step into the arena. Bet molecules. Let the AI judge your face. Winner takes the pot. No excuses.
          </p>

          {!done && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-600 font-bold">Arena opens in</p>
              <div className="flex items-center gap-3">
                {[{ v: h, l: "HRS" }, { v: m, l: "MIN" }, { v: s, l: "SEC" }].map(({ v, l }) => (
                  <div key={l} className="flex flex-col items-center">
                    <div className="flex items-center justify-center w-20 h-20 border border-yellow-500/30 bg-zinc-950">
                      <span
                        className="text-4xl font-black tabular-nums text-yellow-400"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {String(v).padStart(2, "0")}
                      </span>
                    </div>
                    <span className="mt-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-bold">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setShowModal(true)}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
            className="inline-flex items-center justify-center gap-2 font-black text-base px-14 h-14 uppercase tracking-widest bg-yellow-500 text-black transition-all duration-100 active:translate-y-[6px] active:shadow-none"
            style={{
              boxShadow: btnHovered ? "0px 2px 0px #00000060" : "0px 6px 0px #00000060",
              transform: btnHovered ? "translateY(4px)" : "translateY(0px)",
            }}
          >
            Enter Arena
          </button>
        </main>
      </div>

      {/* ── PURPLE OVERLAY (right side, visual only) ── */}
      <div
        className="absolute inset-0 bg-black flex flex-col items-center justify-center px-4 pointer-events-none"
        style={{ clipPath: purpleClip }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-purple-500/40" />
        <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-purple-500/40" />
        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-purple-500/40" />
        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-purple-500/40" />

        <div className="relative flex flex-col items-center text-center space-y-8 max-w-2xl w-full">
          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-purple-500/40" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-purple-500">Volume II</span>
            <div className="h-px w-12 bg-purple-500/40" />
          </div>

          <div className="space-y-2">
            <h1
              className="text-7xl font-black uppercase tracking-tight leading-none md:text-9xl"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <span className="text-white">O</span>
              <span className="text-purple-400">MOG</span>
              <span className="text-white">GER</span>
            </h1>
            <p className="text-zinc-600 text-xs uppercase tracking-[0.4em] font-bold">1v1 Face-Off Arena</p>
          </div>

          <p className="text-zinc-400 text-base max-w-md leading-relaxed">
            Step into the arena. Bet molecules. Let the AI judge your face. Winner takes the pot. No excuses.
          </p>

          {!done && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-600 font-bold">Arena opens in</p>
              <div className="flex items-center gap-3">
                {[{ v: h, l: "HRS" }, { v: m, l: "MIN" }, { v: s, l: "SEC" }].map(({ v, l }) => (
                  <div key={l} className="flex flex-col items-center">
                    <div className="flex items-center justify-center w-20 h-20 border border-purple-500/30 bg-zinc-950">
                      <span
                        className="text-4xl font-black tabular-nums text-purple-400"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {String(v).padStart(2, "0")}
                      </span>
                    </div>
                    <span className="mt-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-bold">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            className="inline-flex items-center justify-center gap-2 font-black text-base px-14 h-14 uppercase tracking-widest bg-purple-500 text-black transition-all duration-100"
            style={{
              boxShadow: btnHovered ? "0px 2px 0px #00000060" : "0px 6px 0px #00000060",
              transform: btnHovered ? "translateY(4px)" : "translateY(0px)",
            }}
          >
            Enter Arena
          </div>
        </div>
      </div>

      {/* ── CRACK SVG ── */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 20, width: "100%", height: "100%" }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Glow */}
        <polyline
          points={crackPolyline}
          fill="none"
          stroke="white"
          strokeWidth="0.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.2"
        />
        {/* Main crack */}
        <polyline
          points={crackPolyline}
          fill="none"
          stroke="white"
          strokeWidth="0.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
        {/* Bright core */}
        <polyline
          points={crackPolyline}
          fill="none"
          stroke="#ffffee"
          strokeWidth="0.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="1"
        />
      </svg>

      {/* ── PASSWORD MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          {/* Crack overlay on modal backdrop */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polyline points={crackPolyline} fill="none" stroke="white" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
            <polyline points={crackPolyline} fill="none" stroke="white" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            <polyline points={crackPolyline} fill="none" stroke="#ffffee" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" opacity="1" />
          </svg>
          <div className="relative w-full max-w-sm border border-yellow-500/30 bg-zinc-950 p-8 space-y-5">
            <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-yellow-500" />
            <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-yellow-500" />

            <button
              onClick={() => { setShowModal(false); setInput(""); setError(false); }}
              className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="size-4" />
            </button>

            <div className="flex justify-center">
              <div className="flex items-center justify-center size-14 border border-yellow-500/30 bg-yellow-500/10">
                <Lock className="size-6 text-yellow-400" />
              </div>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wide text-white">Enter Password</h2>
              <p className="text-xs text-zinc-600">Early access only</p>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleEnter()}
                placeholder="••••••••"
                autoFocus
                className="w-full border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-yellow-500/50 focus:outline-none text-center tracking-widest"
              />
              {error && (
                <p className="text-xs text-red-400 text-center font-bold uppercase tracking-widest">Wrong password</p>
              )}
              <button
                onClick={handleEnter}
                className="w-full h-11 bg-yellow-500 text-black text-sm font-black uppercase tracking-widest hover:bg-yellow-400 transition-colors"
              >
                Enter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
