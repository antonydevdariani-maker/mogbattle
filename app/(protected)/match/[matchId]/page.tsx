"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMatchForUser } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { LiveMatchClient } from "@/components/match/live-match-client";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export default function MatchRoomPage() {
  const params = useParams();
  const matchId = params.matchId as string;
  const router = useRouter();
  const { authenticated, getAccessToken } = usePrivy();
  const [data, setData] = useState<{ match: MatchRow; userId: string } | null>(null);

  useEffect(() => {
    if (!authenticated || !matchId) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await getMatchForUser(token, matchId);
      if (!res) {
        router.replace("/battle");
        return;
      }
      setData(res as { match: MatchRow; userId: string });
    })();
  }, [authenticated, matchId, getAccessToken, router]);

  if (!data) {
    return (
      <div className="flex justify-center py-20 text-sm text-zinc-500">
        Loading match…
      </div>
    );
  }

  const { match, userId } = data;

  return (
    <div className="w-full">
      <LiveMatchClient
        matchId={match.id}
        isPlayer1={match.player1_id === userId}
        initialStatus={match.status}
        winnerId={match.winner_id}
        userId={userId}
        betAmount={match.bet_amount}
        initialAiP1={match.ai_score_p1}
        initialAiP2={match.ai_score_p2}
      />
    </div>
  );
}
