"use client";

import { useAuth } from "@/components/auth/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getMatchForUser, getMatchPlayerProfiles } from "@/app/actions";
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
  type PlayerProfile = { user_id: string; username: string | null; active_tag: string | null };
  const [data, setData] = useState<{ match: MatchRow; userId: string; profiles: PlayerProfile[] } | null>(null);

  useEffect(() => {
    if (!session || !matchId || !token) return;
    (async () => {
      const res = await getMatchForUser(token, matchId);
      if (!res) {
        router.replace("/arena");
        return;
      }
      const profiles = res.match.player2_id
        ? await getMatchPlayerProfiles(res.match.player1_id, res.match.player2_id)
        : [];
      setData({ ...(res as { match: MatchRow; userId: string }), profiles });
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

  const { match, userId, profiles } = data;
  const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;
  const myProfile = profiles.find((p) => p.user_id === userId);
  const oppProfile = profiles.find((p) => p.user_id === opponentId);

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
        myUsername={myProfile?.username ?? null}
        myTag={myProfile?.active_tag ?? null}
        oppUsername={oppProfile?.username ?? null}
        oppTag={oppProfile?.active_tag ?? null}
      />
    </div>
  );
}
