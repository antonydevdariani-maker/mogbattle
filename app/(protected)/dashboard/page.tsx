"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { loadDashboardData } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { Swords, TrendingUp, Trophy, Zap, ArrowRight, Atom } from "lucide-react";
import { FounderBadge } from "@/components/ui/founder-badge";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];

export default function DashboardPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const data = await loadDashboardData(token);
        setProfile(data.profile as Profile | null);
        setMatches((data.matches ?? []) as Match[]);
        setUserId(data.userId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [authenticated, getAccessToken]);

  const winRate =
    profile && profile.matches_played > 0
      ? Math.round((profile.wins / profile.matches_played) * 100)
      : 0;
  const losses = (profile?.matches_played ?? 0) - (profile?.wins ?? 0);

  if (err) {
    return <p className="text-red-400 text-sm">{err}</p>;
  }

  return (
    <div className="w-full space-y-5">
      {/* Hero identity card */}
      <div className="relative border border-white/10 bg-zinc-950 p-6 rounded-xl">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-fuchsia-500" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-fuchsia-500" />
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-zinc-600 font-bold">Arena Identity</p>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1
                className="text-3xl font-black text-white uppercase"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {profile?.username ?? "…"}
              </h1>
              <FounderBadge username={profile?.username} />
            </div>
            <p className="text-sm text-zinc-500">
              ELO <span className="font-bold text-fuchsia-400">{profile?.elo ?? 1500}</span>
              {" · "}
              <span className="text-white">{profile?.wins ?? 0}W</span>
              {" / "}
              <span className="text-zinc-400">{losses}L</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/spin"
              className="flex items-center gap-1.5 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-3 py-1.5 text-xs font-black uppercase tracking-wide rounded-lg hover:bg-cyan-500/20 transition-colors"
            >
              <Atom className="size-3.5" />
              Spin
            </Link>
            <Link
              href="/arena"
              className="flex items-center gap-1.5 bg-fuchsia-500 text-black px-3 py-1.5 text-xs font-black uppercase tracking-wide shadow-[2px_2px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all rounded-lg"
            >
              <Swords className="size-3.5" />
              Battle
            </Link>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-px md:grid-cols-4 bg-white/10">
        <StatCard icon={Zap} label="Mog Credits" value={(profile?.total_credits ?? 0).toLocaleString()} accent="fuchsia" />
        <StatCard icon={TrendingUp} label="ELO Rating" value={String(profile?.elo ?? 1500)} accent="blue" />
        <StatCard icon={Trophy} label="Wins" value={String(profile?.wins ?? 0)} accent="yellow" />
        <StatCard icon={Swords} label="Win Rate" value={`${winRate}%`} accent={winRate >= 50 ? "green" : "red"} />
      </div>

      {/* Recent battles */}
      {matches.length > 0 && userId && (
        <div className="border border-white/10 bg-zinc-950 rounded-xl">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Recent Battles</h2>
          </div>
          <div className="divide-y divide-white/5">
            {matches.map((m) => {
              const won = m.winner_id === userId;
              const myScore = m.player1_id === userId ? m.ai_score_p1 : m.ai_score_p2;
              const oppScore = m.player1_id === userId ? m.ai_score_p2 : m.ai_score_p1;
              return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-900 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-black uppercase px-2 py-0.5 border ${won ? "border-green-500 text-green-400 bg-green-500/5" : "border-red-500 text-red-400 bg-red-500/5"}`}>
                      {won ? "W" : "L"}
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {myScore?.toFixed(1)} vs {oppScore?.toFixed(1)}
                    </span>
                  </div>
                  <span className={`text-sm font-black tabular-nums ${won ? "text-green-400" : "text-zinc-600"}`}>
                    {won ? `+${m.bet_amount * 2}` : `-${m.bet_amount}`} MC
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="border border-dashed border-white/10 bg-zinc-950/30 p-12 text-center rounded-xl">
          <Swords className="mx-auto mb-3 size-8 text-zinc-700" />
          <p className="text-sm text-zinc-500 uppercase tracking-widest">No battles yet.</p>
          <Link href="/arena" className="mt-4 inline-block text-sm font-black text-fuchsia-400 hover:text-fuchsia-300 uppercase tracking-widest">
            Enter the pit →
          </Link>
        </div>
      )}
    </div>
  );
}

const accentMap = {
  fuchsia: { text: "text-fuchsia-400", border: "border-fuchsia-500/30", icon: "text-fuchsia-400" },
  blue:    { text: "text-blue-400",    border: "border-blue-500/30",    icon: "text-blue-400" },
  yellow:  { text: "text-yellow-400",  border: "border-yellow-500/30",  icon: "text-yellow-400" },
  green:   { text: "text-green-400",   border: "border-green-500/30",   icon: "text-green-400" },
  red:     { text: "text-red-400",     border: "border-red-500/30",     icon: "text-red-400" },
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: keyof typeof accentMap;
}) {
  const c = accentMap[accent];
  return (
    <div className="bg-zinc-950 p-5">
      <div className={`mb-3 inline-flex border ${c.border} p-2`}>
        <Icon className={`size-4 ${c.icon}`} />
      </div>
      <p className="mb-1 text-xs uppercase tracking-widest text-zinc-600 font-bold">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${c.text}`} style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </p>
    </div>
  );
}
