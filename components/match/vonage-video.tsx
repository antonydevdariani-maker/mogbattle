"use client";
import { useCallback, useEffect, useRef } from "react";

interface VonageCredentials {
  sessionId: string;
  token: string;
  apiKey: string;
}

export interface UseVonageVideoReturn {
  connect: (creds: VonageCredentials) => void;
  disconnect: () => void;
  captureLocalFrame: () => string | null;
}

export function useVonageVideo(): UseVonageVideoReturn {
  const sessionRef = useRef<any>(null);
  const publisherRef = useRef<any>(null);

  const connect = useCallback(({ sessionId, token, apiKey }: VonageCredentials) => {
    import("@opentok/client").then((mod) => {
      const OT = (mod as any).default ?? mod;

      const publisher = OT.initPublisher(
        "vonage-local-video",
        {
          insertMode: "append",
          width: "100%",
          height: "100%",
          mirror: true,
          style: {
            buttonDisplayMode: "off",
            nameDisplayMode: "off",
            audioLevelDisplayMode: "off",
          },
        },
        (err: any) => {
          if (err) console.error("[Vonage] publisher init error:", err);
        }
      );
      publisherRef.current = publisher;

      const session = OT.initSession(apiKey, sessionId);
      sessionRef.current = session;

      session.on("streamCreated", (event: any) => {
        session.subscribe(
          event.stream,
          "vonage-remote-video",
          {
            insertMode: "append",
            width: "100%",
            height: "100%",
            mirror: false,
            style: {
              buttonDisplayMode: "off",
              nameDisplayMode: "off",
              audioLevelDisplayMode: "off",
            },
          },
          (err: any) => {
            if (err) console.error("[Vonage] subscribe error:", err);
          }
        );
      });

      session.connect(token, (err: any) => {
        if (err) {
          console.error("[Vonage] connect error:", err);
          return;
        }
        session.publish(publisher, (err: any) => {
          if (err) console.error("[Vonage] publish error:", err);
        });
      });
    });
  }, []);

  const disconnect = useCallback(() => {
    try { publisherRef.current?.destroy(); } catch {}
    try { sessionRef.current?.disconnect(); } catch {}
    publisherRef.current = null;
    sessionRef.current = null;
  }, []);

  // Grab frame from local <video> for AI judging — mirrors display (left = mirrored)
  const captureLocalFrame = useCallback((): string | null => {
    const container = document.getElementById("vonage-local-video");
    const video = container?.querySelector("video") as HTMLVideoElement | null;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, 480, 270);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { connect, disconnect, captureLocalFrame };
}
