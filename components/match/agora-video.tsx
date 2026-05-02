"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FaceMeshCanvas } from "@/components/match/face-mesh-canvas";
import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IRemoteVideoTrack,
  type IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

export function useAgoraVideo({
  channelName,
  uid,
  enabled,
  localOnly = false,
}: {
  channelName: string;
  uid: number;
  enabled: boolean;
  /** If true, creates local cam+mic tracks immediately for self-preview without joining a channel. */
  localOnly?: boolean;
}) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const tracksCreated = useRef(false);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<IRemoteAudioTrack | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Create local tracks as soon as localOnly or enabled — gives instant cam preview.
  useEffect(() => {
    if (!localOnly && !enabled) return;
    if (tracksCreated.current) return;
    tracksCreated.current = true;

    setMediaError(null);
    AgoraRTC.createMicrophoneAndCameraTracks(
      { encoderConfig: "music_standard" },
      { encoderConfig: "480p_1", facingMode: "user" }
    ).then(([audioTrack, videoTrack]) => {
      localAudioRef.current = audioTrack;
      localVideoRef.current = videoTrack;
      setLocalReady(true);
    }).catch((e) => {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Could not access camera or microphone.";
      setMediaError(
        /Permission|NotAllowed|denied|NotReadable/i.test(msg)
          ? "Allow camera and microphone for this site to use the arena."
          : msg
      );
      tracksCreated.current = false;
    });

    return () => {
      localVideoRef.current?.stop();
      localVideoRef.current?.close();
      localAudioRef.current?.stop();
      localAudioRef.current?.close();
      localVideoRef.current = null;
      localAudioRef.current = null;
      tracksCreated.current = false;
      setLocalReady(false);
    };
  }, [localOnly, enabled]);

  // Join channel + publish once enabled and tracks are ready.
  useEffect(() => {
    if (!enabled || !channelName || !localReady) return;

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "video") setRemoteVideoTrack(user.videoTrack ?? null);
      if (mediaType === "audio") {
        const track = user.audioTrack;
        setRemoteAudioTrack(track ?? null);
        track?.play();
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType === "video") setRemoteVideoTrack(null);
      if (mediaType === "audio") {
        try { user.audioTrack?.stop(); } catch { /* ignore */ }
        setRemoteAudioTrack(null);
      }
    });

    async function join() {
      try {
        const res = await fetch(`/api/agora-token?channel=${encodeURIComponent(channelName)}&uid=${uid}`);
        const json = await res.json();
        if (!res.ok) throw new Error(`Token fetch failed: ${json.error}`);
        const token: string = json.token;
        await client.join(APP_ID, channelName, token, uid);
        const tracks = [localAudioRef.current, localVideoRef.current].filter(Boolean);
        if (tracks.length) await client.publish(tracks as Parameters<typeof client.publish>[0]);
        setJoined(true);
        setMediaError(null);
      } catch (e) {
        console.error("Agora join error:", e);
        const msg = e instanceof Error ? e.message : String(e);
        setMediaError(
          /Permission|NotAllowed|denied|NotReadable/i.test(msg)
            ? "Allow camera and microphone for this site to use the arena."
            : msg
        );
        setJoined(false);
      }
    }

    void join();

    return () => {
      client.leave().catch(() => {});
      setJoined(false);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
      clientRef.current = null;
    };
  }, [enabled, channelName, uid, localReady]);

  return {
    localVideoTrack: localReady ? localVideoRef.current : null,
    remoteVideoTrack,
    remoteAudioTrack,
    joined,
    mediaError,
  };
}

export type VideoBoxHandle = { captureFrame: () => string | null };

export const LocalVideoBox = forwardRef<VideoBoxHandle, {
  track: ICameraVideoTrack | null;
  label: string;
  accentColor: "fuchsia" | "red";
  overlay?: React.ReactNode;
  showFaceMesh?: boolean;
}>(function LocalVideoBox({ track, label, accentColor, overlay, showFaceMesh }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: () => captureFrameFromContainer(containerRef.current),
  }));

  useEffect(() => {
    if (!track || !containerRef.current) return;
    track.play(containerRef.current);
    return () => { track.stop(); };
  }, [track]);

  return (
    <VideoShell containerRef={containerRef} label={label} accentColor={accentColor} hasTrack={!!track} overlay={overlay} showFaceMesh={showFaceMesh} />
  );
});

export const RemoteVideoBox = forwardRef<VideoBoxHandle, {
  track: IRemoteVideoTrack | null;
  label: string;
  accentColor: "fuchsia" | "red";
  overlay?: React.ReactNode;
  showFaceMesh?: boolean;
}>(function RemoteVideoBox({ track, label, accentColor, overlay, showFaceMesh }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: () => captureFrameFromContainer(containerRef.current),
  }));

  useEffect(() => {
    if (!track || !containerRef.current) return;
    track.play(containerRef.current);
    return () => { track.stop(); };
  }, [track]);

  return (
    <VideoShell containerRef={containerRef} label={label} accentColor={accentColor} hasTrack={!!track} overlay={overlay} showFaceMesh={showFaceMesh} />
  );
});

function captureFrameFromContainer(container: HTMLDivElement | null): string | null {
  const video = container?.querySelector("video");
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, 480, 270);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function VideoShell({
  containerRef,
  label,
  accentColor,
  hasTrack,
  overlay,
  showFaceMesh,
  mirrored,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  accentColor: "fuchsia" | "red";
  hasTrack: boolean;
  overlay?: React.ReactNode;
  showFaceMesh?: boolean;
  mirrored?: boolean;
}) {
  const borderClass = hasTrack
    ? accentColor === "fuchsia"
      ? "border-fuchsia-500/50"
      : "border-red-500/50"
    : "border-zinc-800";

  return (
    <div className={`rounded-2xl border ${borderClass} bg-zinc-950/80 overflow-hidden transition-all`}>
      <div className="relative aspect-video bg-zinc-950 overflow-hidden">
        {/* Agora renders video into this div */}
        <div ref={containerRef} className="absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover" />

        {/* Face mesh overlay */}
        {showFaceMesh && hasTrack && (
          <FaceMeshCanvas
            containerRef={containerRef}
            mirrored={mirrored}
          />
        )}

        {/* Placeholder when no track */}
        {!hasTrack && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`size-16 rounded-full border-2 opacity-20 ${
                accentColor === "fuchsia" ? "border-fuchsia-400" : "border-red-400"
              }`}
            />
          </div>
        )}

        {/* Overlay slot (bet offer, etc.) */}
        {overlay && (
          <div className="absolute inset-x-0 top-0 flex justify-center pt-3 pointer-events-none z-10">
            {overlay}
          </div>
        )}

        {hasTrack && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 z-10">
            <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono text-red-400">LIVE</span>
          </div>
        )}

        <div className="absolute bottom-2 right-2 z-10">
          <span className={`text-xs font-bold tracking-widest opacity-60 ${
            accentColor === "fuchsia" ? "text-fuchsia-300" : "text-red-300"
          }`}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
