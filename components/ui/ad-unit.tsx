"use client";

import { useEffect, useRef } from "react";

// 300x250 banner
function Banner300({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.querySelector("script")) return;
    const s = document.createElement("script");
    s.innerHTML = `atOptions={'key':'dc3e35cdc847df0e821adb7110627193','format':'iframe','height':250,'width':300,'params':{}};`;
    const s2 = document.createElement("script");
    s2.src = "https://www.highperformanceformat.com/dc3e35cdc847df0e821adb7110627193/invoke.js";
    s2.async = true;
    ref.current.appendChild(s);
    ref.current.appendChild(s2);
  }, [id]);
  return <div ref={ref} style={{ width: 300, height: 250 }} />;
}

// 728x90 banner (desktop only)
function Banner728({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.querySelector("script")) return;
    const s = document.createElement("script");
    s.innerHTML = `atOptions={'key':'3d0d93f3de51a4697e525250444430e7','format':'iframe','height':90,'width':728,'params':{}};`;
    const s2 = document.createElement("script");
    s2.src = "https://www.highperformanceformat.com/3d0d93f3de51a4697e525250444430e7/invoke.js";
    s2.async = true;
    ref.current.appendChild(s);
    ref.current.appendChild(s2);
  }, [id]);
  return <div ref={ref} style={{ width: 728, height: 90 }} />;
}

// Native banner
function NativeBanner({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.querySelector("script")) return;
    const s = document.createElement("script");
    s.src = "https://pl29370635.profitablecpmratenetwork.com/ef5f4367028522e898ca40231e6055fc/invoke.js";
    s.async = true;
    s.setAttribute("data-cfasync", "false");
    const container = document.createElement("div");
    container.id = "container-ef5f4367028522e898ca40231e6055fc";
    ref.current.appendChild(s);
    ref.current.appendChild(container);
  }, [id]);
  return <div ref={ref} className="w-full" />;
}

let adCount = 0;

export function AdUnit({ className, variant = "auto" }: { className?: string; variant?: "300x250" | "728x90" | "native" | "auto" }) {
  const id = useRef(`ad-${++adCount}`).current;

  const pick = variant === "auto"
    ? (typeof window !== "undefined" && window.innerWidth >= 728 ? "728x90" : "300x250")
    : variant;

  return (
    <div className={`flex justify-center overflow-hidden ${className ?? ""}`}>
      {pick === "native" && <NativeBanner id={id} />}
      {pick === "728x90" && <Banner728 id={id} />}
      {pick === "300x250" && <Banner300 id={id} />}
    </div>
  );
}
