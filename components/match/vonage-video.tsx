"use client";
import { useCallback, useEffect, useRef } from "react";
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
  IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";

interface VideoCredentials {
  /** Agora channel name (= matchId) */
  sessionId: string;
  /** Agora RTC token, or null when Agora certificate is disabled */
  token: string | null;
  /** Agora App ID */
  apiKey: string;
}

export interface UseVonageVideoReturn {
  startPreview: () => void;
  connect: (creds: VideoCredentials) => void;
  disconnect: () => void;
  captureLocalFrame: () => string | null;
}

export function useVonageVideo(): UseVonageVideoReturn {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteVideoRef = useRef<IRemoteVideoTrack | null>(null);
  const remoteAudioRef = useRef<IRemoteAudioTrack | null>(null);
  const joinedRef = useRef(false);

  const getAgoraRTC = useCallback(async () => {
    const mod = await import("agora-rtc-sdk-ng");
    return mod.default;
  }, []);

  const startPreview = useCallback(() => {
    if (localVideoRef.current) return;
    getAgoraRTC().then(async (AgoraRTC) => {
      try {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        videoTrack.play("vonage-local-video");
      } catch (err) {
        console.error("[Video] preview error:", err);
      }
    });
  }, [getAgoraRTC]);

  const connect = useCallback(({ sessionId, token, apiKey }: VideoCredentials) => {
    getAgoraRTC().then(async (AgoraRTC) => {
      try {
        // Create client if needed
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        }
        const client = clientRef.current;

        // Subscribe to remote user when they publish
        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video") {
            remoteVideoRef.current = user.videoTrack ?? null;
            user.videoTrack?.play("vonage-remote-video");
          }
          if (mediaType === "audio") {
            remoteAudioRef.current = user.audioTrack ?? null;
            try {
              const result = user.audioTrack?.play() as unknown;
              if (result && typeof (result as Promise<void>).catch === "function") {
                (result as Promise<void>).catch(() => {
                  document.addEventListener("click", () => user.audioTrack?.play(), { once: true });
                });
              }
            } catch {
              document.addEventListener("click", () => user.audioTrack?.play(), { once: true });
            }
          }
        });

        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "video") remoteVideoRef.current = null;
          if (mediaType === "audio") remoteAudioRef.current = null;
        });

        // Join channel
        if (!joinedRef.current) {
          await client.join(apiKey, sessionId, token ?? null, 0);
          joinedRef.current = true;
        }

        // Ensure local tracks exist before publishing
        if (!localVideoRef.current || !localAudioRef.current) {
          const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          localAudioRef.current = audioTrack;
          localVideoRef.current = videoTrack;
          videoTrack.play("vonage-local-video");
        }

        await client.publish([localAudioRef.current!, localVideoRef.current!]);

        // Subscribe to anyone already in channel
        client.remoteUsers.forEach(async (user) => {
          if (user.hasVideo) {
            await client.subscribe(user, "video");
            remoteVideoRef.current = user.videoTrack ?? null;
            user.videoTrack?.play("vonage-remote-video");
          }
          if (user.hasAudio) {
            await client.subscribe(user, "audio");
            remoteAudioRef.current = user.audioTrack ?? null;
            user.audioTrack?.play();
          }
        });
      } catch (err) {
        console.error("[Video] connect error:", err);
      }
    });
  }, [getAgoraRTC]);

  const disconnect = useCallback(() => {
    try { localVideoRef.current?.stop(); localVideoRef.current?.close(); } catch { /* ignore */ }
    try { localAudioRef.current?.stop(); localAudioRef.current?.close(); } catch { /* ignore */ }
    try {
      if (joinedRef.current) clientRef.current?.leave();
    } catch { /* ignore */ }
    localVideoRef.current = null;
    localAudioRef.current = null;
    remoteVideoRef.current = null;
    remoteAudioRef.current = null;
    joinedRef.current = false;
  }, []);

  const captureLocalFrame = useCallback((): string | null => {
    const container = document.getElementById("vonage-local-video");
    const video = container?.querySelector("video") as HTMLVideoElement | null;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, 480, 270);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { startPreview, connect, disconnect, captureLocalFrame };
}
