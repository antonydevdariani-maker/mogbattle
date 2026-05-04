"use client";
import { useCallback, useEffect, useRef } from "react";
import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";

interface VideoCredentials {
  sessionId: string; // Agora channel name (= matchId)
  token: string | null;
  apiKey: string; // Agora App ID
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
  const joinedRef = useRef(false);

  /** Play remote video into element — retries up to 2s to handle React mount timing */
  function playRemoteVideo(track: IRemoteVideoTrack | null | undefined, attemptsLeft = 10) {
    if (!track) return;
    const el = document.getElementById("vonage-remote-video");
    if (el) {
      try { track.play(el); } catch { /* ignore autoplay */ }
    } else if (attemptsLeft > 0) {
      setTimeout(() => playRemoteVideo(track, attemptsLeft - 1), 200);
    }
  }

  const startPreview = useCallback(() => {
    if (localVideoRef.current) return;
    AgoraRTC.createMicrophoneAndCameraTracks()
      .then(([audioTrack, videoTrack]) => {
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        const el = document.getElementById("vonage-local-video");
        if (el) videoTrack.play(el);
      })
      .catch((err) => console.error("[Video] preview error:", err));
  }, []);

  const connect = useCallback(({ sessionId, token, apiKey }: VideoCredentials) => {
    (async () => {
      try {
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        }
        const client = clientRef.current;

        client.on("user-published", async (user, mediaType) => {
          console.log("[Video] user-published uid:", user.uid, "type:", mediaType);
          await client.subscribe(user, mediaType);
          if (mediaType === "video") {
            console.log("[Video] playing remote video");
            playRemoteVideo(user.videoTrack);
          }
          if (mediaType === "audio") {
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

        client.on("user-unpublished", () => {
          console.log("[Video] user-unpublished");
        });

        if (!joinedRef.current) {
          console.log("[Video] joining channel:", sessionId, "appId:", apiKey);
          await client.join(apiKey, sessionId, token ?? null, 0);
          joinedRef.current = true;
          console.log("[Video] joined successfully, remote users:", client.remoteUsers.length);
        }

        // Create tracks if startPreview didn't run or failed
        if (!localVideoRef.current || !localAudioRef.current) {
          const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          localAudioRef.current = audioTrack;
          localVideoRef.current = videoTrack;
          const el = document.getElementById("vonage-local-video");
          if (el) videoTrack.play(el);
        }

        await client.publish([localAudioRef.current!, localVideoRef.current!]);
        console.log("[Video] published local tracks");

        // Subscribe to anyone already in the channel
        for (const user of client.remoteUsers) {
          if (user.hasVideo) {
            await client.subscribe(user, "video");
            playRemoteVideo(user.videoTrack);
          }
          if (user.hasAudio) {
            await client.subscribe(user, "audio");
            user.audioTrack?.play();
          }
        }
      } catch (err) {
        console.error("[Video] connect error:", err);
      }
    })();
  }, []);

  const disconnect = useCallback(() => {
    try { localVideoRef.current?.stop(); localVideoRef.current?.close(); } catch { /* ignore */ }
    try { localAudioRef.current?.stop(); localAudioRef.current?.close(); } catch { /* ignore */ }
    if (joinedRef.current) {
      try { clientRef.current?.leave(); } catch { /* ignore */ }
    }
    localVideoRef.current = null;
    localAudioRef.current = null;
    joinedRef.current = false;
    clientRef.current = null;
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
