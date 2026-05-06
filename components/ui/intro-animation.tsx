"use client";

import { useEffect, useRef, useState } from "react";

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const flashRef = useRef<HTMLDivElement>(null);
  const purpleRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const flash = flashRef.current;
    const purple = purpleRef.current;
    const yellow = yellowRef.current;
    if (!flash || !purple || !yellow) return;

    const s = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) =>
      Object.assign(el.style, styles);

    // 800ms — flash strike
    setTimeout(() => {
      s(flash, { transition: "opacity 0.04s", opacity: "1" });
    }, 800);

    // 850ms — color swap + flash fades
    setTimeout(() => {
      s(flash, { transition: "opacity 0.2s", opacity: "0" });
      s(purple, { opacity: "0" });
      s(yellow, { opacity: "1", transform: "scale(1.05)" });
    }, 850);

    setTimeout(() => {
      s(yellow, { transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)", transform: "scale(1)" });
    }, 900);

    // 2000ms — fade out to title
    setTimeout(() => {
      setFading(true);
      setTimeout(onDone, 500);
    }, 2000);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
      style={{ transition: "opacity 0.5s", opacity: fading ? 0 : 1, pointerEvents: fading ? "none" : "all" }}
    >
      {/* Flash */}
      <div ref={flashRef} className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />

      <div className="relative flex items-center justify-center" style={{ width: "90vw", maxWidth: 700, height: 120 }}>
        {/* Purple .COM (start) */}
        <div ref={purpleRef} className="absolute inset-0 flex items-center justify-center" style={{ opacity: 1 }}>
          <svg width="100%" height="120" viewBox="0 0 700 100">
            <text x="0" y="88" fontFamily="Impact, Arial Black, sans-serif" fontSize="96" fontWeight="900" fill="white" letterSpacing="-3">OMOGGER</text>
            <text x="506" y="88" fontFamily="Impact, Arial Black, sans-serif" fontSize="96" fontWeight="900" fill="#cc44ff" letterSpacing="-3">.COM</text>
          </svg>
        </div>

        {/* Gold .COM (post-strike) */}
        <div ref={yellowRef} className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0 }}>
          <svg width="100%" height="120" viewBox="0 0 700 100">
            <text x="0" y="88" fontFamily="Impact, Arial Black, sans-serif" fontSize="96" fontWeight="900" fill="white" letterSpacing="-3">OMOGGER</text>
            <text x="506" y="88" fontFamily="Impact, Arial Black, sans-serif" fontSize="96" fontWeight="900" fill="#FFD700" letterSpacing="-3" style={{ filter: "drop-shadow(0 0 8px #FFD70088)" }}>.COM</text>
          </svg>
        </div>
      </div>
    </div>
  );
}
