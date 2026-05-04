"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IRemoteVideoTrack,
  type IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
/** Stable DOM id Agora uses to render the remote video — must match RemoteVideoBox */
const REMOTE_VIDEO_EL_ID = "agora-remote-video-container";

export function useAgoraVideo({
  channelName,
  uid,
  enabled,
  localOnly = false,
}: {
  channelName: string;
  uid: number;
  enabled: boolean;
  localOnly?: boolean;
}) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteAudioRef = useRef<IRemoteAudioTrack | null>(null);
  const tracksCreated = useRef(false);

  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<IRemoteAudioTrack | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  /** Play a remote audio track; marks muted and retries on next user click if autoplay is blocked. */
  function safePlayAudio(track: IRemoteAudioTrack | null | undefined) {
    if (!track) return;
    try {
      track.play();
      setAudioMuted(false);
    } catch {
      setAudioMuted(true);
      const resume = () => {
        try { track.play(); setAudioMuted(false); } catch { /* ignore */ }
        document.removeEventListener("click", resume);
      };
      document.addEventListener("click", resume, { once: true });
    }
  }

  /**
   * Play the remote video track immediately into the stable DOM element.
   * Calling this right in the Agora callback avoids the async React re-render delay.
   */
  function playRemoteVideo(track: IRemoteVideoTrack | null | undefined) {
    if (!track) return;
    const el = document.getElementById(REMOTE_VIDEO_EL_ID);
    if (el) {
      try { track.play(el); } catch { /* ignore */ }
    }
  }

  /** Called from the UI "Start Audio" button so the user gesture unlocks AudioContext. */
  function unlockAudio() {
    safePlayAudio(remoteAudioRef.current);
  }

  // Create local tracks as soon as localOnly or enabled.
  useEffect(() => {
    if (!localOnly && !enabled) return;
    if (tracksCreated.current) return;
    tracksCreated.current = true;

    let cancelled = false;
    setMediaError(null);

    (async () => {
      try {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { encoderConfig: "music_standard" },
          { encoderConfig: "480p_1", facingMode: "user" }
        );
        if (cancelled) {
          try { audioTrack?.stop(); } catch { /* ignore */ }
          try { audioTrack?.close(); } catch { /* ignore */ }
          try { videoTrack?.stop(); } catch { /* ignore */ }
          try { videoTrack?.close(); } catch { /* ignore */ }
          return;
        }
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        setLocalReady(true);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Could not access camera or microphone.";
        setMediaError(
          /Permission|NotAllowed|denied|NotReadable|Overconstrained/i.test(msg)
            ? "Camera blocked — click the lock icon in your address bar and allow camera + mic."
            : msg
        );
        tracksCreated.current = false;
      }
    })();

    return () => {
      cancelled = true;
      try { localVideoRef.current?.stop(); } catch { /* ignore */ }
      try { localVideoRef.current?.close(); } catch { /* ignore */ }
      try { localAudioRef.current?.stop(); } catch { /* ignore */ }
      try { localAudioRef.current?.close(); } catch { /* ignore */ }
      localVideoRef.current = null;
      localAudioRef.current = null;
      tracksCreated.current = false;
      setLocalReady(false);
    };
  }, [localOnly, enabled]);

  // Join channel + publish once enabled and tracks are ready.
  useEffect(() => {
    if (!enabled || !channelName || !localReady) return;

    let cancelled = false;
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    // Attach listeners BEFORE joining so no events are missed.
    client.on("user-left", () => {
      setOpponentLeft(true);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
      remoteAudioRef.current = null;
    });

    client.on("user-published", async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
      } catch (e) {
        console.warn("Agora subscribe failed, retrying:", e);
        try { await client.subscribe(user, mediaType); } catch { return; }
      }
      if (cancelled) return;

      if (mediaType === "video") {
        const track = user.videoTrack ?? null;
        setRemoteVideoTrack(track);
        // Play immediately into the stable DOM element — no React re-render delay.
        playRemoteVideo(track);
      }
      if (mediaType === "audio") {
        const track = user.audioTrack ?? null;
        remoteAudioRef.current = track;
        setRemoteAudioTrack(track);
        safePlayAudio(track);
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType === "video") setRemoteVideoTrack(null);
      if (mediaType === "audio") {
        try { user.audioTrack?.stop(); } catch { /* ignore */ }
        remoteAudioRef.current = null;
        setRemoteAudioTrack(null);
      }
    });

    async function join(attempt = 0) {
      if (cancelled) return;
      try {
        const numericUid = Math.floor(uid);
        const res = await fetch(`/api/agora-token?channel=${encodeURIComponent(channelName)}&uid=${numericUid}`);
        const json = await res.json() as { token?: string; error?: string };
        if (!res.ok) throw new Error(`Token fetch failed: ${json.error ?? res.status}`);
        if (cancelled) return;

        await client.join(APP_ID, channelName, json.token!, numericUid);
        if (cancelled) { void client.leave().catch(() => {}); return; }

        const tracks = [localAudioRef.current, localVideoRef.current].filter(Boolean);
        if (tracks.length) await client.publish(tracks as Parameters<typeof client.publish>[0]);

        // Late-joiner: subscribe to anyone already in the channel.
        for (const remote of client.remoteUsers) {
          if (cancelled) break;
          if (remote.hasVideo) {
            try { await client.subscribe(remote, "video"); } catch { /* not published yet */ }
          }
          if (remote.hasAudio) {
            try { await client.subscribe(remote, "audio"); } catch { /* not published yet */ }
          }
          if (cancelled) break;

          const v = remote.videoTrack;
          if (v) {
            setRemoteVideoTrack(v);
            playRemoteVideo(v);       // immediate play — no React delay
          }
          const a = remote.audioTrack;
          if (a) {
            remoteAudioRef.current = a;
            setRemoteAudioTrack(a);
            safePlayAudio(a);
          }
        }

        if (!cancelled) { setJoined(true); setMediaError(null); }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const isTransient = /CAN_NOT_GET_GATEWAY|GATEWAY_SERVER|timeout|network/i.test(msg);
        const isPerm = /Permission|NotAllowed|denied|NotReadable/i.test(msg);

        if (isTransient && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          if (clientRef.current === client) void join(attempt + 1);
          return;
        }

        console.error("Agora join error:", e);
        setMediaError(
          isPerm
            ? "Camera blocked — click the lock icon and allow camera + mic."
            : isTransient
            ? "Connection issue — retrying failed. Check your network and reload."
            : "Could not connect to match server. Please reload."
        );
        setJoined(false);
      }
    }

    void join();

    return () => {
      cancelled = true;
      void client.leave().catch(() => {});
      clientRef.current = null;
      remoteAudioRef.current = null;
      setJoined(false);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
    };
  }, [enabled, channelName, uid, localReady]);

  return {
    localVideoTrack: localReady ? localVideoRef.current : null,
    remoteVideoTrack,
    remoteAudioTrack,
    joined,
    mediaError,
    opponentLeft,
    audioMuted,
    unlockAudio,
  };
}

export type VideoBoxHandle = { captureFrame: () => string | null };

/** Left panel — always YOUR local camera. Mirrored like a selfie. */
export const LocalVideoBox = forwardRef<VideoBoxHandle, {
  track: ICameraVideoTrack | null;
  label: string;
  accentColor: "fuchsia" | "red";
  overlay?: React.ReactNode;
  showFaceMesh?: boolean;
}>(function LocalVideoBox({ track, label, accentColor, overlay }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: () => captureFrameFromContainer(containerRef.current),
  }));

  useEffect(() => {
    if (!track || !containerRef.current) return;
    try { track.play(containerRef.current); } catch { /* ignore */ }
    return () => { try { track?.stop(); } catch { /* ignore */ } };
  }, [track]);

  // mirrored=true so local preview feels like looking in a mirror
  return (
    <VideoShell containerRef={containerRef} label={label} accentColor={accentColor} hasTrack={!!track} overlay={overlay} mirrored />
  );
});

/** Right panel — always the OPPONENT's remote video. Uses stable DOM id so Agora can play immediately. */
export const RemoteVideoBox = forwardRef<VideoBoxHandle, {
  track: IRemoteVideoTrack | null;
  label: string;
  accentColor: "fuchsia" | "red";
  overlay?: React.ReactNode;
  showFaceMesh?: boolean;
  mirrored?: boolean;
}>(function RemoteVideoBox({ track, label, accentColor, overlay, mirrored = false }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: () => captureFrameFromContainer(containerRef.current),
  }));

  // Fallback: if the track arrives via React state, also play it here.
  useEffect(() => {
    if (!track || !containerRef.current) return;
    try { track.play(containerRef.current); } catch { /* ignore — already played via direct DOM call */ }
    return () => { try { track?.stop(); } catch { /* ignore */ } };
  }, [track]);

  return (
    <VideoShell
      containerRef={containerRef}
      containerId={REMOTE_VIDEO_EL_ID}
      label={label}
      accentColor={accentColor}
      hasTrack={!!track}
      overlay={overlay}
      mirrored={mirrored}
    />
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
  containerId,
  label,
  accentColor,
  hasTrack,
  overlay,
  mirrored,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerId?: string;
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
        <div
          id={containerId}
          ref={containerRef}
          className="absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        />

        {!hasTrack && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`size-16 rounded-full border-2 opacity-20 ${
                accentColor === "fuchsia" ? "border-fuchsia-400" : "border-red-400"
              }`}
            />
          </div>
        )}

        {overlay && (
          <div className="absolute inset-x-0 top-0 flex justify-center pt-3 z-10">
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
