"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";

export default function Home() {
  const [showLocked, setShowLocked] = useState(false);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-black relative overflow-hidden">
      {/* Grid bg */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-yellow-500/40" />
      <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-yellow-500/40" />
      <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-yellow-500/40" />
      <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-yellow-500/40" />

      <main className="relative flex flex-col items-center text-center space-y-8 max-w-2xl w-full">
        {/* Volume label */}
        <div className="flex items-center gap-3">
          <div className="h-px w-12 bg-yellow-500/40" />
          <span className="text-xs font-black uppercase tracking-[0.3em] text-yellow-500">
            Volume II
          </span>
          <div className="h-px w-12 bg-yellow-500/40" />
        </div>

        {/* Logo / Title */}
        <div className="space-y-2">
          <h1
            className="text-7xl font-black uppercase tracking-tight leading-none md:text-9xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span className="text-white">O</span>
            <span className="text-yellow-400">MOG</span>
            <span className="text-white">GER</span>
          </h1>
          <p className="text-zinc-600 text-xs uppercase tracking-[0.4em] font-bold">
            1v1 Face-Off Arena
          </p>
        </div>

        {/* Tagline */}
        <p className="text-zinc-400 text-base max-w-md leading-relaxed">
          Step into the arena. Bet molecules. Let the AI judge your face.
          Winner takes the pot. No excuses.
        </p>

        {/* CTA */}
        <button
          onClick={() => setShowLocked(true)}
          className="inline-flex items-center justify-center gap-2 font-black text-base px-14 h-14 uppercase tracking-widest bg-yellow-500 text-black shadow-[4px_4px_0_#ffffff30] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
        >
          Enter Arena
        </button>

        {/* Coming soon note */}
        <p className="text-zinc-700 text-xs uppercase tracking-widest">
          Season 2 — Coming Soon
        </p>
      </main>

      {/* Locked modal */}
      {showLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="relative w-full max-w-sm border border-yellow-500/30 bg-zinc-950 p-8 text-center space-y-5">
            <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-yellow-500" />
            <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-yellow-500" />

            <button
              onClick={() => setShowLocked(false)}
              className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="size-4" />
            </button>

            <div className="flex justify-center">
              <div className="flex items-center justify-center size-14 border border-yellow-500/30 bg-yellow-500/10">
                <Lock className="size-6 text-yellow-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black uppercase tracking-wide text-white">
                Arena Locked
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Omogger Volume II is not open yet. Check back soon — the arena is loading.
              </p>
            </div>

            <button
              onClick={() => setShowLocked(false)}
              className="w-full h-11 bg-yellow-500 text-black text-sm font-black uppercase tracking-widest hover:bg-yellow-400 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
