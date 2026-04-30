"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  channelName: string;
  uid: number;
  enabled: boolean;
}) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<IRemoteAudioTrack | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!enabled || !channelName) return;

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
      if (mediaType === "audio") setRemoteAudioTrack(null);
    });

    async function join() {
      try {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { encoderConfig: "speech_standard" },
          { encoderConfig: "480p_1" }
        );
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        setLocalReady(true);

        await client.join(APP_ID, channelName, null, uid);
        await client.publish([audioTrack, videoTrack]);
        setJoined(true);
      } catch (e) {
        console.error("Agora join error:", e);
      }
    }

    join();

    return () => {
      localVideoRef.current?.stop();
      localVideoRef.current?.close();
      localAudioRef.current?.stop();
      localAudioRef.current?.close();
      client.leave().catch(() => {});
      setLocalReady(false);
      setJoined(false);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
    };
  }, [enabled, channelName, uid]);

  return {
    localVideoTrack: localReady ? localVideoRef.current : null,
    remoteVideoTrack,
    remoteAudioTrack,
    joined,
  };
}

export function LocalVideoBox({
  track,
  label,
  accentColor,
  overlay,
}: {
  track: ICameraVideoTrack | null;
  label: string;
  accentColor: "fuchsia" | "red";
  overlay?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!track || !containerRef.current) return;
    track.play(containerRef.current);
    return () => { track.stop(); };
  }, [track]);

  return (
    <VideoShell containerRef={containerRef} label={label} accentColor={accentColor} hasTrack={!!track} overlay={overlay} />
  );
}

export function RemoteVideoBox({
  track,
  label,
  accentColor,
  overlay,
}: {
  track: IRemoteVideoTrack | null;
  label: string;
  accentColor: "fuchsia" | "red";
  overlay?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!track || !containerRef.current) return;
    track.play(containerRef.current);
    return () => { track.stop(); };
  }, [track]);

  return (
    <VideoShell containerRef={containerRef} label={label} accentColor={accentColor} hasTrack={!!track} overlay={overlay} />
  );
}

function VideoShell({
  containerRef,
  label,
  accentColor,
  hasTrack,
  overlay,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  accentColor: "fuchsia" | "red";
  hasTrack: boolean;
  overlay?: React.ReactNode;
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
