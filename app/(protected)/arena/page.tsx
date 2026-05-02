"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { checkArenaState, loadProfileSummary } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { ArenaClient } from "@/components/arena/arena-client";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export default function ArenaPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState(0);
  const [molecules, setMolecules] = useState(0);
  const [activeMatch, setActiveMatch] = useState<MatchRow | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [opponentAvatarUrl, setOpponentAvatarUrl] = useState<string | null>(null);

  const init = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const [state, profile] = await Promise.all([
      checkArenaState(token),
      loadProfileSummary(token),
    ]);
    setActiveMatch(state.activeMatch as MatchRow | null);
    setOpponentName(state.opponentName);
    setOpponentAvatarUrl(state.opponentAvatarUrl ?? null);
    setUserId(state.userId);
    setBalance(profile?.total_credits ?? 0);
    setMolecules(profile?.molecules ?? 0);
    setUsername(profile?.username ?? null);
    setWalletAddress(profile?.wallet_address ?? null);
    setMyAvatarUrl(profile?.avatar_url ?? null);
    setReady(true);
  }, [getAccessToken]);

  useEffect(() => {
    if (!authenticated) return;
    init();
  }, [authenticated, init]);

  if (!ready || !userId) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-12">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="absolute inset-0 border-2 border-fuchsia-500 animate-ping"
                style={{ animationDelay: `${i * 0.4}s`, animationDuration: "1.2s" }}
              />
            ))}
            <div className="relative size-full border border-fuchsia-500/60 bg-fuchsia-500/10" />
          </div>
          <p className="text-xs text-zinc-600 uppercase tracking-widest font-bold">Loading Arena…</p>
        </div>
      </div>
    );
  }

  return (
    <ArenaClient
      initialBalance={balance}
      initialMolecules={molecules}
      initialMatch={activeMatch}
      initialOpponentName={opponentName}
      initialOpponentAvatarUrl={opponentAvatarUrl}
      userId={userId}
      displayName={username}
      walletAddress={walletAddress}
      myAvatarUrl={myAvatarUrl}
    />
  );
}
