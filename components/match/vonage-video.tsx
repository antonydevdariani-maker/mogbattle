"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Session, Publisher, OTError, Stream } from "@opentok/client";

interface VonageCredentials {
  sessionId: string;
  token: string;
  apiKey: string;
}

export interface UseVonageVideoReturn {
  startPreview: () => void;
  connect: (creds: VonageCredentials) => void;
  disconnect: () => void;
  captureLocalFrame: () => string | null;
}

const PUBLISHER_OPTS = {
  insertMode: "append" as const,
  width: "100%",
  height: "100%",
  mirror: true,
  style: {
    buttonDisplayMode: "off" as const,
    nameDisplayMode: "off" as const,
    audioLevelDisplayMode: "off" as const,
  },
};

export function useVonageVideo(): UseVonageVideoReturn {
  const sessionRef = useRef<Session | null>(null);
  const publisherRef = useRef<Publisher | null>(null);
  const otRef = useRef<typeof import("@opentok/client") | null>(null);

  // Load OT SDK once
  const getOT = useCallback(async () => {
    if (!otRef.current) {
      otRef.current = await import("@opentok/client");
    }
    return otRef.current;
  }, []);

  // Start local camera preview without a session (queue / negotiating phase)
  const startPreview = useCallback(() => {
    if (publisherRef.current) return; // already running
    getOT().then((OT) => {
      const publisher = OT.initPublisher(
        "vonage-local-video",
        PUBLISHER_OPTS,
        (err: OTError | undefined) => {
          if (err) console.error("[Vonage] preview error:", err.message);
        }
      );
      publisherRef.current = publisher;
    });
  }, [getOT]);

  // Join session and publish existing (or new) publisher
  const connect = useCallback(({ sessionId, token, apiKey }: VonageCredentials) => {
    getOT().then((OT) => {
      // Reuse publisher started during preview, or create a new one
      const publisher = publisherRef.current ?? OT.initPublisher(
        "vonage-local-video",
        PUBLISHER_OPTS,
        (err: OTError | undefined) => {
          if (err) console.error("[Vonage] publisher error:", err.message);
        }
      );
      publisherRef.current = publisher;

      const session = OT.initSession(apiKey, sessionId);
      sessionRef.current = session;

      session.on("streamCreated", (event: { stream: Stream }) => {
        session.subscribe(
          event.stream,
          "vonage-remote-video",
          {
            insertMode: "append",
            width: "100%",
            height: "100%",
            style: {
              buttonDisplayMode: "off",
              nameDisplayMode: "off",
              audioLevelDisplayMode: "off",
            },
          },
          (err: OTError | undefined) => {
            if (err) console.error("[Vonage] subscribe error:", err.message);
          }
        );
      });

      session.connect(token, (err: OTError | undefined) => {
        if (err) {
          console.error("[Vonage] connect error:", err.message);
          return;
        }
        session.publish(publisher, (pubErr: OTError | undefined) => {
          if (pubErr) console.error("[Vonage] publish error:", pubErr.message);
        });
      });
    });
  }, [getOT]);

  const disconnect = useCallback(() => {
    try { publisherRef.current?.destroy(); } catch { /* ignore */ }
    try { sessionRef.current?.disconnect(); } catch { /* ignore */ }
    publisherRef.current = null;
    sessionRef.current = null;
  }, []);

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

  return { startPreview, connect, disconnect, captureLocalFrame };
}
