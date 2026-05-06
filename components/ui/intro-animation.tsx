"use client";

import { useEffect, useRef, useState } from "react";

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const flashRef = useRef<HTMLDivElement>(null);
  const purpleRef = useRef<SVGSVGElement>(null);
  const yellowRef = useRef<SVGSVGElement>(null);
  const lightningRef = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const flash = flashRef.current;
    const logoPurple = purpleRef.current;
    const logoYellow = yellowRef.current;
    const lightning = lightningRef.current;
    if (!flash || !logoPurple || !logoYellow || !lightning) return;

    const set = (el: HTMLElement | SVGSVGElement, styles: Partial<CSSStyleDeclaration>) =>
      Object.assign(el.style, styles);

    // lightning appears
    setTimeout(() => set(lightning, { transition: "opacity 0.05s", opacity: "1" }), 800);

    // flash + purple brightens
    setTimeout(() => {
      set(lightning, { opacity: "0" });
      set(flash, { transition: "opacity 0.05s", opacity: "0.95" });
      set(logoPurple, { transition: "filter 0.05s, transform 0.05s", filter: "brightness(3)", transform: "scale(1.04) translateX(-3px)" });
    }, 1100);

    // swap to yellow
    setTimeout(() => {
      set(flash, { transition: "opacity 0.15s", opacity: "0" });
      set(logoPurple, { opacity: "0" });
      set(logoYellow, { transition: "none", opacity: "1", transform: "scale(1.04) translateX(-3px)" });
    }, 1160);

    // settle
    setTimeout(() => {
      set(logoYellow, { transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)", transform: "scale(1) translateX(0)" });
    }, 1200);

    // second flash
    setTimeout(() => set(flash, { transition: "opacity 0.05s", opacity: "0.4" }), 1250);
    setTimeout(() => set(flash, { transition: "opacity 0.2s", opacity: "0" }), 1300);

    // fade out overlay
    setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 400);
    }, 2000);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-400"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "all" : "none" }}
    >
      <div className="relative flex items-center justify-center" style={{ width: 480, height: 80 }}>
        {/* Flash overlay */}
        <div ref={flashRef} className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />

        {/* Purple logo (starting state) */}
        <svg ref={purpleRef} width="480" height="80" viewBox="0 0 480 80" className="absolute" style={{ opacity: 1 }}>
          <text x="0" y="68" fontFamily="Impact, Arial Black, sans-serif" fontSize="72" fontWeight="900" fill="white" letterSpacing="-2">OMOGGER</text>
          <text x="348" y="68" fontFamily="Impact, Arial Black, sans-serif" fontSize="72" fontWeight="900" fill="#cc44ff" letterSpacing="-2">.COM</text>
        </svg>

        {/* Yellow logo (post-strike) */}
        <svg ref={yellowRef} width="480" height="80" viewBox="0 0 480 80" className="absolute" style={{ opacity: 0 }}>
          <text x="0" y="68" fontFamily="Impact, Arial Black, sans-serif" fontSize="72" fontWeight="900" fill="white" letterSpacing="-2">OMOGGER</text>
          <text x="348" y="68" fontFamily="Impact, Arial Black, sans-serif" fontSize="72" fontWeight="900" fill="#FFD700" letterSpacing="-2">.COM</text>
        </svg>

        {/* Lightning bolt */}
        <svg ref={lightningRef} width="60" height="180" viewBox="0 0 60 180" className="absolute" style={{ opacity: 0, top: -80, left: "50%", transform: "translateX(-50%)" }}>
          <polyline points="35,0 15,80 30,80 10,180" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="35,0 15,80 30,80 10,180" fill="none" stroke="#ffffaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </svg>
      </div>
    </div>
  );
}
