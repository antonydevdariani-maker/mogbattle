"use client";

import { useRef, useState, useCallback } from "react";
import { Loader2, Upload, Camera, RotateCcw, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

type AiResult = {
  psl: number;
  rating: number;
  verdict: string;
  failos?: string;
  strengths?: string;
} | null;

function pslColor(psl: number) {
  if (psl >= 7) return "text-yellow-400";
  if (psl >= 6) return "text-fuchsia-400";
  if (psl >= 5) return "text-blue-400";
  if (psl >= 4) return "text-zinc-300";
  return "text-red-400";
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);

  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camActive, setCamActive] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function tryLogin() {
    if (pw === "t") {
      setAuthed(true);
    } else {
      setPwErr(true);
    }
  }

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  async function startCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamActive(true);
      setPreview(null);
      setResult(null);
      setError(null);
    } catch {
      setError("Camera access denied");
    }
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamActive(false);
  }

  function snap() {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPreview(dataUrl);
    stopCam();
    setResult(null);
    setError(null);
  }

  async function judge() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/judge-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: preview }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    stopCam();
    setPreview(null);
    setResult(null);
    setError(null);
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative w-full max-w-xs space-y-6 border border-white/10 bg-zinc-950 p-8">
          <div className="absolute -top-px -left-px w-8 h-8 border-t-2 border-l-2 border-fuchsia-500" />
          <div className="absolute -bottom-px -right-px w-8 h-8 border-b-2 border-r-2 border-fuchsia-500" />
          <div className="text-center space-y-1">
            <FlaskConical className="mx-auto size-6 text-fuchsia-400" />
            <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-400 font-bold">Admin</p>
            <p className="text-xs text-zinc-600">AI Face Rater — Dev Tool</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setPwErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && tryLogin()}
              placeholder="Password"
              className={cn(
                "w-full bg-zinc-900 border px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-fuchsia-500",
                pwErr ? "border-red-500" : "border-white/10"
              )}
            />
            {pwErr && <p className="text-xs text-red-400">Wrong password</p>}
            <button
              onClick={tryLogin}
              className="w-full h-11 bg-fuchsia-500 text-black text-sm font-black uppercase tracking-widest hover:bg-fuchsia-400 transition-colors"
            >
              Enter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative mx-auto max-w-lg space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <FlaskConical className="size-5 text-fuchsia-400" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-400 font-bold">Admin</p>
            <h1 className="text-xl font-black uppercase text-white" style={{ fontFamily: "var(--font-heading)" }}>
              PSL AI Rater
            </h1>
          </div>
          {(preview || camActive) && (
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          )}
        </div>

        {/* Camera live view */}
        {camActive && (
          <div className="space-y-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden border border-white/10 bg-zinc-950">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <div className="absolute inset-0 border-4 border-fuchsia-500/20 pointer-events-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={snap}
                className="h-12 bg-fuchsia-500 text-black text-sm font-black uppercase tracking-widest hover:bg-fuchsia-400 transition-colors"
              >
                Snap
              </button>
              <button
                onClick={stopCam}
                className="h-12 border border-white/20 text-zinc-400 text-sm font-bold uppercase tracking-widest hover:border-white/40 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Upload zone / preview */}
        {!camActive && (
          <>
            {!preview ? (
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                className="group relative flex flex-col items-center justify-center gap-4 border-2 border-dashed border-white/10 bg-zinc-950 p-10 hover:border-fuchsia-500/40 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-8 text-zinc-600 group-hover:text-fuchsia-400 transition-colors" />
                <div className="text-center">
                  <p className="text-sm font-bold text-zinc-400">Drop image or click to upload</p>
                  <p className="text-xs text-zinc-600 mt-1">JPG, PNG, WEBP</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="relative border border-white/10 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Face to judge" className="w-full object-cover max-h-[400px]" />
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={startCam}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-12 border border-white/20 text-zinc-400 text-sm font-bold uppercase tracking-widest hover:border-fuchsia-500/40 hover:text-fuchsia-300 transition-colors disabled:opacity-40"
              >
                <Camera className="size-4" />
                Camera
              </button>
              <button
                onClick={preview ? judge : () => fileRef.current?.click()}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-12 bg-fuchsia-500 text-black text-sm font-black uppercase tracking-widest hover:bg-fuchsia-400 transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <><Loader2 className="size-4 animate-spin" /> Judging…</>
                ) : preview ? (
                  "Judge Face"
                ) : (
                  <><Upload className="size-4" /> Upload</>
                )}
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs text-red-400 font-bold">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && result.psl > 0 && (
          <div className="space-y-4 border border-white/10 bg-zinc-950 p-6">
            {/* PSL big number */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-600 font-bold mb-1">PSL Score</p>
              <p className={cn("text-7xl font-black tabular-nums", pslColor(result.psl))} style={{ fontFamily: "var(--font-heading)" }}>
                {result.psl.toFixed(1)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Rating: {result.rating.toFixed(1)} / 10</p>
            </div>

            {/* Verdict */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs uppercase tracking-widest text-zinc-600 font-bold mb-2">Verdict</p>
              <p className="text-sm text-zinc-200 italic">&ldquo;{result.verdict}&rdquo;</p>
            </div>

            {/* Strengths / Failos */}
            {(result.strengths || result.failos) && (
              <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                {result.strengths && result.strengths !== "n/a" && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-green-500 font-bold mb-1">Strengths</p>
                    <p className="text-xs text-zinc-300">{result.strengths}</p>
                  </div>
                )}
                {result.failos && result.failos !== "none" && result.failos !== "n/a" && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-red-400 font-bold mb-1">Failos</p>
                    <p className="text-xs text-zinc-400">{result.failos}</p>
                  </div>
                )}
              </div>
            )}

            {/* PSL tier label */}
            <div className="border-t border-white/10 pt-4 text-center">
              <p className={cn("text-xs font-bold uppercase tracking-widest", pslColor(result.psl))}>
                {result.psl >= 7.5 ? "Near Perfect" :
                 result.psl >= 7 ? "Elite Tier" :
                 result.psl >= 6.5 ? "High Model Tier" :
                 result.psl >= 6 ? "Model Tier" :
                 result.psl >= 5.5 ? "Very Good Looking" :
                 result.psl >= 5 ? "Attractive" :
                 result.psl >= 4.5 ? "Above Average" :
                 result.psl >= 4 ? "Average" :
                 result.psl >= 3 ? "Below Average" :
                 "Unattractive"}
              </p>
            </div>
          </div>
        )}

        {result && result.psl === 0 && (
          <div className="border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-center">
            <p className="text-sm text-yellow-400 font-bold">No face detected</p>
            <p className="text-xs text-zinc-500 mt-1">Try a clearer photo with your face visible</p>
          </div>
        )}
      </div>
    </div>
  );
}
