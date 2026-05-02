"use client";

import { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Face oval connections (jaw contour) — pairs of landmark indices
// These are the official MediaPipe face oval connections
const FACE_OVAL: [number, number][] = [
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
];

// Jaw-only subset (bottom portion of face oval)
const JAW_START = 7; // index into FACE_OVAL where jaw-bottom begins
const JAW_END = 29;  // index where jaw-bottom ends

// Cheekbone highlight points
const LEFT_CHEEK = [116, 123, 147, 213];
const RIGHT_CHEEK = [345, 352, 376, 433];

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
  color = "#a855f7",
  mirrored = false,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  color?: string;
  /** Mirror canvas horizontally to match CSS-mirrored video */
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

      const lx = (i: number) => lm[i].x * W;
      const ly = (i: number) => lm[i].y * H;

      // Draw jaw contour (glowing line)
      const jawSegments = FACE_OVAL.slice(JAW_START, JAW_END);

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const [fa] = jawSegments[0];
      ctx.moveTo(lx(fa), ly(fa));
      for (const [a, b] of jawSegments) {
        ctx.lineTo(lx(a), ly(a));
        ctx.lineTo(lx(b), ly(b));
      }
      ctx.stroke();
      ctx.restore();

      // Draw cheekbone highlight dots
      for (const idx of [...LEFT_CHEEK, ...RIGHT_CHEEK]) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(lx(idx), ly(idx), 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Cheekbone arc lines
      const drawArc = (pts: number[]) => {
        if (pts.length < 2) return;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(lx(pts[0]), ly(pts[0]));
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(lx(pts[i]), ly(pts[i]));
        }
        ctx.stroke();
        ctx.restore();
      };

      drawArc(LEFT_CHEEK);
      drawArc(RIGHT_CHEEK);
    }

    void init();

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, color]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 5, transform: mirrored ? "scaleX(-1)" : undefined }}
    />
  );
}
