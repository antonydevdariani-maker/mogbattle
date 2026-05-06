"use client";

import { useEffect, useRef, useState } from "react";

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const flashRef = useRef<HTMLDivElement>(null);
  const purpleRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const lightningRef = useRef<SVGSVGElement>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const flash = flashRef.current;
    const purple = purpleRef.current;
    const yellow = yellowRef.current;
    const lightning = lightningRef.current;
    if (!flash || !purple || !yellow || !lightning) return;

    const s = (el: HTMLElement | SVGSVGElement, styles: Partial<CSSStyleDeclaration>) =>
      Object.assign(el.style, styles);

    // 800ms — bolt appears instantly (already positioned over logo)
    setTimeout(() => s(lightning, { transition: "opacity 0.06s", opacity: "1" }), 800);

    // 1050ms — STRIKE: flash + color swap
    setTimeout(() => {
      s(lightning, { opacity: "0" });
      s(flash, { transition: "opacity 0.04s", opacity: "1" });
    }, 1050);

    setTimeout(() => {
      s(flash, { transition: "opacity 0.2s", opacity: "0" });
      s(purple, { opacity: "0" });
      s(yellow, { opacity: "1", transform: "scale(1.05)" });
    }, 1110);

    setTimeout(() => {
      s(yellow, { transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)", transform: "scale(1)" });
    }, 1150);

    // 2200ms — fade out to title
    setTimeout(() => {
      setFading(true);
      setTimeout(onDone, 500);
    }, 2200);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
      style={{ transition: "opacity 0.5s", opacity: fading ? 0 : 1, pointerEvents: fading ? "none" : "all" }}
    >
      {/* Flash */}
      <div ref={flashRef} className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />

      <div className="relative flex items-center justify-center" style={{ width: "90vw", maxWidth: 700, height: 120 }}>

        {/* Single lightning bolt — sits above .COM */}
        <svg
          ref={lightningRef}
          width="70"
          height="220"
          viewBox="0 0 70 220"
          className="absolute pointer-events-none"
          style={{
            opacity: 0,
            top: -200,
            right: "5%",
            filter: "drop-shadow(0 0 10px #fff) drop-shadow(0 0 24px #FFD700)",
          }}
        >
          <polyline
            points="45,0 20,110 38,110 12,220"
            fill="none"
            stroke="#FFE066"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Purple .COM (start) */}
        <div ref={purpleRef} className="absolute inset-0 flex items-center justify-center" style={{ opacity: 1 }}>
          <svg width="100%" height="120" viewBox="0 0 700 100">
            <text x="0" y="88" fontFamily="Impact, Arial Black, sans-serif" fontSize="96" fontWeight="900" fill="white" letterSpacing="-3">OMOGGER</text>
            <text x="506" y="88" fontFamily="Impact, Arial Black, sans-serif" fontSize="96" fontWeight="900" fill="#cc44ff" letterSpacing="-3">.COM</text>
          </svg>
        </div>

        {/* Yellow .COM (post-strike) */}
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
