"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth/auth-context";
import { checkArenaState, loadProfileSummary } from "@/app/actions";
import type { Database } from "@/lib/types/database";

const ArenaClient = dynamic(
  () => import("@/components/arena/arena-client").then((m) => m.ArenaClient),
  { ssr: false }
);

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export default function ArenaPage() {
  const { session, token } = useAuth();
  const [ready, setReady] = useState(false);
  const [molecules, setMolecules] = useState(0);
  const [activeMatch, setActiveMatch] = useState<MatchRow | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isFounder, setIsFounder] = useState(false);

  const init = useCallback(async () => {
    if (!token) return;
    const [state, profile] = await Promise.all([
      checkArenaState(token),
      loadProfileSummary(token),
    ]);
    setActiveMatch(state.activeMatch as MatchRow | null);
    setOpponentName(state.opponentName);
    setUserId(state.userId);
    setMolecules(profile?.molecules ?? 0);
    setUsername(profile?.username ?? null);
    setIsFounder(profile?.is_founder ?? false);
    setReady(true);
  }, [token]);

  useEffect(() => {
    if (!session) return;
    init();
  }, [session, init]);

  if (!ready || !userId) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-12">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="absolute inset-0 border-2 border-yellow-500 animate-ping"
                style={{ animationDelay: `${i * 0.4}s`, animationDuration: "1.2s" }}
              />
            ))}
            <div className="relative size-full border border-yellow-500/60 bg-yellow-500/10" />
          </div>
          <p className="text-xs text-zinc-600 uppercase tracking-widest font-bold">Loading Arena…</p>
        </div>
      </div>
    );
  }

  return (
    <ArenaClient
      initialBalance={0}
      initialMolecules={molecules}
      initialMatch={activeMatch}
      initialOpponentName={opponentName}
      userId={userId}
      displayName={username}
      walletAddress={null}
      isFounder={isFounder}
    />
  );
}
