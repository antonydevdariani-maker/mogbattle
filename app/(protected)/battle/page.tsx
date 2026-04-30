"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { loadBattleQueueState } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { MatchmakingClient } from "@/components/battle/matchmaking-client";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export default function BattlePage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [activeMatch, setActiveMatch] = useState<MatchRow | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const pull = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const s = await loadBattleQueueState(token);
    setActiveMatch(s.activeMatch as MatchRow | null);
    setOpponentName(s.opponentName);
    setUserId(s.userId);
  }, [getAccessToken]);

  useEffect(() => {
    if (!authenticated) return;
    pull();
    const id = setInterval(pull, 3000);
    return () => clearInterval(id);
  }, [authenticated, pull]);

  if (!userId) {
    return (
      <div className="flex justify-center py-20 text-sm text-zinc-500">
        Loading queue…
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
            Find a Match
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Pick your stake. Enter the queue. Mog or be mogged.</p>
        </div>
        <MatchmakingClient
          existingMatch={activeMatch}
          userId={userId}
          opponentName={opponentName}
          onRefresh={pull}
        />
      </div>
    </div>
  );
}
