"use client";

import { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Unique landmark indices along the jaw/chin contour
const JAW_DOTS = [
  356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
  377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
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
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  mirrored?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(-1);

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

      if (!result.faceLandmarks?.length) return;

      const lm = result.faceLandmarks[0];
      const W = canvas.width;
      const H = canvas.height;

      // Draw green glowing dots along jawline/chin
      for (const idx of JAW_DOTS) {
        const x = lm[idx].x * W;
        const y = lm[idx].y * H;
        ctx.save();
        ctx.shadowColor = "#22c55e";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#4ade80";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    void init();

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 5, transform: mirrored ? "scaleX(-1)" : undefined }}
    />
  );
}
