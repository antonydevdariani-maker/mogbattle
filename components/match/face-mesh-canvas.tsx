"use client";

import { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// 7 landmark dots: forehead, eye corners (×2), jaw angles (×2), chin sides (×2)
const FACE_DOTS = [
  10,   // forehead top
  33,   // left eye outer corner
  263,  // right eye outer corner
  234,  // left jaw angle
  454,  // right jaw angle
  148,  // left chin side
  377,  // right chin side
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
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    })();
  }
  return landmarkerPromise;
}

export function FaceMeshCanvas({
  containerRef,
  mirrored = false,
  onFaceChange,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  mirrored?: boolean;
  onFaceChange?: (detected: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(-1);
  const faceDetectedRef = useRef<boolean>(false);

  useEffect(() => {
    let active = true;
    let landmarker: FaceLandmarker | null = null;

    async function init() {
      landmarker = await getLandmarker();
      if (!active) return;
      loop();
    }

    function loop() {
      if (!active) return;
      rafRef.current = requestAnimationFrame(loop);

      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const video = container.querySelector("video");
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      const now = performance.now();
      if (now === lastTimeRef.current) return;
      lastTimeRef.current = now;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const result = landmarker!.detectForVideo(video, now);
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const hasFace = !!(result.faceLandmarks?.length);
      if (hasFace !== faceDetectedRef.current) {
        faceDetectedRef.current = hasFace;
        onFaceChange?.(hasFace);
      }
      if (!hasFace) return;

      const lm = result.faceLandmarks[0];
      const W = canvas.width;
      const H = canvas.height;

      for (const idx of FACE_DOTS) {
        const x = lm[idx].x * W;
        const y = lm[idx].y * H;
        ctx.save();
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#e879f9";
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        // Inner bright core
        ctx.shadowBlur = 4;
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    void init();

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, onFaceChange]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 5, transform: mirrored ? "scaleX(-1)" : undefined }}
    />
  );
}
