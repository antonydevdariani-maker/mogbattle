"use client";

import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { motion } from "framer-motion";
import { CheckCircle2, Camera } from "lucide-react";

type Step = "blink" | "turn-left" | "turn-right" | "done";

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: "blink", label: "Blink once", hint: "Look at the camera and blink" },
  { id: "turn-left", label: "Turn head left", hint: "Slowly turn your head to the left" },
  { id: "turn-right", label: "Turn head right", hint: "Now turn your head to the right" },
];

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks("/mediapipe");
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
    })();
  }
  return landmarkerPromise;
}

export function LivenessCheck({ onVerified }: { onVerified: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const [step, setStep] = useState<Step>("blink");
  const [progress, setProgress] = useState(0);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  // Refs to track state inside RAF without stale closures
  const stepRef = useRef<Step>("blink");
  const eyeWasOpen = useRef(true);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamReady(true);
      })
      .catch(() => setCamError("Camera access required for verification. Allow it in your browser and reload."));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!camReady) return;

    let active = true;

    getLandmarker().then((landmarker) => {
      if (!active) return;
      let lastTime = -1;

      function loop() {
        if (!active) return;
        rafRef.current = requestAnimationFrame(loop);

        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        const now = performance.now();
        if (now === lastTime) return;
        lastTime = now;

        const result = landmarker.detectForVideo(video, now);
        if (!result.faceLandmarks?.length) return;

        const lm = result.faceLandmarks[0];
        const shapes = result.faceBlendshapes?.[0]?.categories ?? [];
        const currentStep = stepRef.current;

        if (currentStep === "blink") {
          const leftBlink = shapes.find((b) => b.categoryName === "eyeBlinkLeft")?.score ?? 0;
          const rightBlink = shapes.find((b) => b.categoryName === "eyeBlinkRight")?.score ?? 0;
          const blinkScore = Math.max(leftBlink, rightBlink);

          if (eyeWasOpen.current && blinkScore > 0.55) {
            eyeWasOpen.current = false; // eyes closing
          } else if (!eyeWasOpen.current && blinkScore < 0.2) {
            eyeWasOpen.current = true; // eyes open again → blink complete
            stepRef.current = "turn-left";
            setStep("turn-left");
            setProgress(1);
          }
        } else if (currentStep === "turn-left") {
          // Nose tip (1) vs face horizontal center derived from ear landmarks
          const noseTip = lm[1];
          const leftEar = lm[234];
          const rightEar = lm[454];
          const faceWidth = Math.abs(rightEar.x - leftEar.x);
          const centerX = (leftEar.x + rightEar.x) / 2;
          // Mirrored display: user turning head left → nose moves rightward in raw coords
          if (noseTip.x - centerX > faceWidth * 0.28) {
            stepRef.current = "turn-right";
            setStep("turn-right");
            setProgress(2);
          }
        } else if (currentStep === "turn-right") {
          const noseTip = lm[1];
          const leftEar = lm[234];
          const rightEar = lm[454];
          const faceWidth = Math.abs(rightEar.x - leftEar.x);
          const centerX = (leftEar.x + rightEar.x) / 2;
          // User turning head right → nose moves leftward in raw coords
          if (centerX - noseTip.x > faceWidth * 0.28) {
            stepRef.current = "done";
            setStep("done");
            setProgress(3);
            active = false;
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach((t) => t.stop());
            setTimeout(onVerified, 900);
          }
        }
      }

      loop();
    });

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [camReady, onVerified]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xs">
      {/* Camera preview */}
      <div className="relative w-56 h-72 border-2 border-yellow-500/50 bg-zinc-950 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        {!camReady && !camError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Camera className="size-8 text-zinc-700" />
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Starting camera…</span>
          </div>
        )}
        {/* Corner accents */}
        <div className="pointer-events-none absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-yellow-400" />
        <div className="pointer-events-none absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-yellow-400" />
        <div className="pointer-events-none absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-yellow-400" />
        <div className="pointer-events-none absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-yellow-400" />

        {/* Live indicator */}
        {camReady && step !== "done" && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 px-2 py-0.5">
            <motion.span
              className="size-1.5 rounded-full bg-red-500"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-[9px] font-mono text-red-400 font-bold uppercase">Live</span>
          </div>
        )}
      </div>

      {camError && (
        <p className="text-xs text-red-400 font-bold text-center px-2">{camError}</p>
      )}

      {/* Step list */}
      <div className="w-full space-y-2">
        {STEPS.map((s, i) => {
          const done = progress > i;
          const active = step === s.id;
          return (
            <motion.div
              key={s.id}
              animate={active ? { borderColor: "rgba(217,70,239,0.6)", backgroundColor: "rgba(217,70,239,0.08)" } : {}}
              className={`flex items-start gap-3 border px-4 py-3 transition-colors duration-300 ${
                done
                  ? "border-green-500/40 bg-green-500/5"
                  : active
                  ? "border-yellow-500/60 bg-yellow-500/10"
                  : "border-zinc-800 opacity-40"
              }`}
            >
              <div
                className={`mt-0.5 size-4 flex items-center justify-center shrink-0 ${
                  done ? "text-green-400" : active ? "text-yellow-400" : "text-zinc-700"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <span className="text-[10px] font-black">{i + 1}</span>
                )}
              </div>
              <div>
                <p
                  className={`text-xs font-black uppercase tracking-widest ${
                    done ? "text-green-300" : active ? "text-white" : "text-zinc-600"
                  }`}
                >
                  {s.label}
                </p>
                {active && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] text-yellow-300 mt-0.5"
                  >
                    {s.hint}
                  </motion.p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {step === "done" && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-2 font-black uppercase tracking-widest text-green-400 text-sm"
        >
          <CheckCircle2 className="size-5" />
          Identity confirmed
        </motion.div>
      )}
    </div>
  );
}
