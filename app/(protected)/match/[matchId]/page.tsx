"use client";

import { useAuth } from "@/components/auth/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getMatchForUser } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import {
  useArenaMatchLeaveSetters,
  useWarnBeforeUnloadIf,
} from "@/components/arena/arena-match-leave-context";

const LiveMatchClient = dynamic(
  () => import("@/components/match/live-match-client").then((m) => m.LiveMatchClient),
  { ssr: false }
);

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export default function MatchRoomPage() {
  const params = useParams();
  const matchId = params.matchId as string;
  const router = useRouter();
  const { session, token } = useAuth();
  const { setMatchAtRisk } = useArenaMatchLeaveSetters();
  const [data, setData] = useState<{ match: MatchRow; userId: string } | null>(null);

  useEffect(() => {
    if (!session || !matchId || !token) return;
    (async () => {
      const res = await getMatchForUser(token, matchId);
      if (!res) {
        router.replace("/arena");
        return;
      }
      setData(res as { match: MatchRow; userId: string });
    })();
  }, [session, matchId, token, router]);

  const roomLeaveRisk =
    data != null &&
    data.match.status !== "completed" &&
    data.match.status !== "cancelled" &&
    (data.match.status === "matched" || data.match.status === "live");
  useWarnBeforeUnloadIf(!!roomLeaveRisk);

  useEffect(() => {
    setMatchAtRisk(!!roomLeaveRisk);
    return () => setMatchAtRisk(false);
  }, [roomLeaveRisk, setMatchAtRisk]);

  if (!data) {
    return (
      <div className="flex justify-center py-20 text-sm text-zinc-500">
        Loading match…
      </div>
    );
  }

  const { match, userId } = data;
  const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;

  return (
    <div className="w-full">
      <LiveMatchClient
        matchId={match.id}
        isPlayer1={match.player1_id === userId}
        initialStatus={match.status}
        winnerId={match.winner_id}
        userId={userId}
        opponentId={opponentId ?? null}
        betAmount={match.bet_amount}
        isFreeMatch={match.is_free_match ?? true}
        initialAiP1={match.ai_score_p1}
        initialAiP2={match.ai_score_p2}
      />
    </div>
  );
}
