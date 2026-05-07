"use client";

import { useState, useEffect, useRef } from "react";
import { X, Mail, User, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { IntroAnimation } from "@/components/ui/intro-animation";
import { joinWaitlist } from "@/app/actions";

const LAUNCH_TIME = new Date("2026-05-07T10:00:00-04:00").getTime();

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
// Purple clips to LEFT side of crack (main page)
const purpleClip = `polygon(0% 0%, ${crack.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 0% 100%)`;
// Purple clips to RIGHT side of crack (modal)
const purpleRightClip = `polygon(${crack.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 100% 100%, 100% 0%)`;

export default function Home() {
  const router = useRouter();
  const { h, m, s, done } = useCountdown(LAUNCH_TIME);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [modalBtnHovered, setModalBtnHovered] = useState(false);
  const nameInputRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLDivElement>(null);
  const [inputMaskRects, setInputMaskRects] = useState<{ y: number; h: number }[]>([]);

  useEffect(() => {
    if (!showModal) { setInputMaskRects([]); return; }
    const measure = () => {
      const rects = [nameInputRef.current, emailInputRef.current]
        .filter(Boolean)
        .map((el) => {
          const r = el!.getBoundingClientRect();
          return { y: (r.top / window.innerHeight) * 100, h: (r.height / window.innerHeight) * 100 };
        });
      setInputMaskRects(rects);
    };
    const t = setTimeout(measure, 60);
    return () => clearTimeout(t);
  }, [showModal]);

  async function handleJoin() {
    setLoading(true);
    setError("");
    try {
      await joinWaitlist(email, name);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEmail("");
    setName("");
    setError("");
    setSuccess(false);
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
            <span className="text-xs font-black uppercase tracking-[0.3em] text-yellow-500">
              Volume <span className="cursor-pointer" onClick={() => router.push("/login")}>II</span>
            </span>
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
            className="inline-flex items-center justify-center gap-2 font-black text-base px-14 h-14 uppercase tracking-widest text-black transition-all duration-100 active:translate-y-[6px] active:shadow-none"
            style={{
              backgroundColor: btnHovered ? "#facc15" : "#eab308",
              boxShadow: btnHovered ? "0px 2px 0px #00000060" : "0px 6px 0px #00000060",
              transform: btnHovered ? "translateY(4px)" : "translateY(0px)",
            }}
          >
            Join Waitlist
          </button>
        </main>
      </div>

      {/* ── PURPLE OVERLAY (left side, visual only) ── */}
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
            className="inline-flex items-center justify-center gap-2 font-black text-base px-14 h-14 uppercase tracking-widest text-black transition-all duration-100"
            style={{
              backgroundColor: btnHovered ? "#c084fc" : "#a855f7",
              boxShadow: btnHovered ? "0px 2px 0px #00000060" : "0px 6px 0px #00000060",
              transform: btnHovered ? "translateY(4px)" : "translateY(0px)",
            }}
          >
            Join Waitlist
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
        <polyline points={crackPolyline} fill="none" stroke="white" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
        <polyline points={crackPolyline} fill="none" stroke="white" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        <polyline points={crackPolyline} fill="none" stroke="#ffffee" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" opacity="1" />
      </svg>

      {/* ── WAITLIST MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">

          {/* Yellow modal (base) */}
          <div className="relative w-full max-w-sm border border-yellow-500/30 bg-zinc-950 p-8 space-y-5">
            <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-yellow-500" />
            <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-yellow-500" />

            <button
              onClick={closeModal}
              className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="size-4" />
            </button>

            {success ? (
              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <CheckCircle className="size-12 text-yellow-400" />
                <div>
                  <h2 className="text-xl font-black uppercase tracking-wide text-white">You&apos;re In</h2>
                  <p className="text-xs text-zinc-500 mt-1">We&apos;ll email you when the arena opens.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <div className="flex items-center justify-center size-14 border border-yellow-500/30 bg-yellow-500/10">
                    <Mail className="size-6 text-yellow-400" />
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <h2 className="text-xl font-black uppercase tracking-wide text-white">Join Waitlist</h2>
                  <p className="text-xs text-zinc-600">Get notified when the arena opens</p>
                </div>

                <div className="space-y-3">
                  <div className="relative" ref={nameInputRef}>
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-600" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name (optional)"
                      className="w-full border border-white/10 bg-zinc-900 pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-yellow-500/50 focus:outline-none tracking-wide"
                    />
                  </div>
                  <div className="relative" ref={emailInputRef}>
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-600" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                      placeholder="your@email.com"
                      autoFocus
                      className="w-full border border-white/10 bg-zinc-900 pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-yellow-500/50 focus:outline-none tracking-wide"
                    />
                  </div>
                  {error && (
                    <p className="text-xs text-red-400 text-center font-bold uppercase tracking-widest">{error}</p>
                  )}
                  <button
                    onClick={handleJoin}
                    disabled={loading}
                    onMouseEnter={() => setModalBtnHovered(true)}
                    onMouseLeave={() => setModalBtnHovered(false)}
                    className="w-full h-11 text-black text-sm font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                    style={{ backgroundColor: modalBtnHovered ? "#facc15" : "#eab308" }}
                  >
                    {loading ? "Joining…" : "Join Waitlist"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Purple overlay — left side of crack, visual only */}
          <div
            className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none"
            style={{ clipPath: purpleClip }}
          >
            <div className="relative w-full max-w-sm border border-purple-500/30 bg-zinc-950 p-8 space-y-5">
              <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-purple-500" />
              <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-purple-500" />
              <div className="absolute top-3 right-3 w-4 h-4" />
              {success ? (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <CheckCircle className="size-12 text-purple-400" />
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-wide text-white">You&apos;re In</h2>
                    <p className="text-xs text-zinc-500 mt-1">We&apos;ll email you when the arena opens.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-center">
                    <div className="flex items-center justify-center size-14 border border-purple-500/30 bg-purple-500/10">
                      <Mail className="size-6 text-purple-400" />
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black uppercase tracking-wide text-white">Join Waitlist</h2>
                    <p className="text-xs text-zinc-600">Get notified when the arena opens</p>
                  </div>
                  <div className="space-y-3">
                    <div className="w-full border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-700">Your name (optional)</div>
                    <div className="w-full border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-700">your@email.com</div>
                    <div
                      className="w-full h-11 text-black text-sm font-black uppercase tracking-widest flex items-center justify-center transition-colors"
                      style={{ backgroundColor: modalBtnHovered ? "#c084fc" : "#a855f7" }}
                    >
                      Join Waitlist
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Crack on top of everything — masked out over input boxes */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 60, width: "100%", height: "100%" }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <mask id="modal-crack-mask">
                <rect x="0" y="0" width="100" height="100" fill="white" />
                {inputMaskRects.map(({ y, h }, i) => (
                  <rect key={i} x="0" y={y} width="100" height={h} fill="black" />
                ))}
              </mask>
            </defs>
            <g mask="url(#modal-crack-mask)">
              <polyline points={crackPolyline} fill="none" stroke="white" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
              <polyline points={crackPolyline} fill="none" stroke="white" strokeWidth="0.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
              <polyline points={crackPolyline} fill="none" stroke="#ffffee" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" opacity="1" />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
