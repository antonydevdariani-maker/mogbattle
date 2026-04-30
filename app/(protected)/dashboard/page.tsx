"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { loadDashboardData } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { Swords, TrendingUp, Trophy, Zap, ArrowRight } from "lucide-react";

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
    <div className="w-full space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 80% 50%, oklch(0.72 0.26 305) 0%, transparent 60%)`,
          }}
        />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-zinc-500">Arena Identity</p>
            <h1
              className="mb-1 text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {profile?.username ?? "…"}
            </h1>
            <p className="text-sm text-zinc-400">
              ELO <span className="font-semibold text-fuchsia-300">{profile?.elo ?? 1500}</span>
              {" · "}
              {profile?.wins ?? 0}W / {losses}L
            </p>
          </div>
          <Link
            href="/battle"
            className="glow-fuchsia flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fuchsia-500"
          >
            <Swords className="size-4" />
            Battle Now
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Zap} label="Mog Credits" value={(profile?.total_credits ?? 0).toLocaleString()} color="fuchsia" />
        <StatCard icon={TrendingUp} label="ELO Rating" value={String(profile?.elo ?? 1500)} color="blue" />
        <StatCard icon={Trophy} label="Wins" value={String(profile?.wins ?? 0)} color="yellow" />
        <StatCard icon={Swords} label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? "green" : "red"} />
      </div>

      {matches.length > 0 && userId && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Recent Battles</h2>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {matches.map((m) => {
              const won = m.winner_id === userId;
              const myScore = m.player1_id === userId ? m.ai_score_p1 : m.ai_score_p2;
              const oppScore = m.player1_id === userId ? m.ai_score_p2 : m.ai_score_p1;
              return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`size-2 rounded-full ${won ? "bg-green-400" : "bg-red-400"}`} />
                    <span className={`text-sm font-semibold ${won ? "text-green-300" : "text-red-300"}`}>
                      {won ? "W" : "L"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {myScore?.toFixed(1)} vs {oppScore?.toFixed(1)}
                    </span>
                  </div>
                  <span className={`text-sm font-semibold ${won ? "text-green-300" : "text-zinc-500"}`}>
                    {won ? `+${m.bet_amount * 2}` : `-${m.bet_amount}`} MC
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/30 p-12 text-center">
          <Swords className="mx-auto mb-3 size-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">No battles yet. Enter the pit.</p>
          <Link href="/battle" className="mt-4 inline-block text-sm font-medium text-fuchsia-400 hover:text-fuchsia-300">
            Find an opponent →
          </Link>
        </div>
      )}
    </div>
  );
}

const colorMap = {
  fuchsia: "text-fuchsia-300",
  blue: "text-blue-300",
  yellow: "text-yellow-300",
  green: "text-green-300",
  red: "text-red-300",
};

const iconBgMap = {
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-400",
  blue: "bg-blue-500/10 text-blue-400",
  yellow: "bg-yellow-500/10 text-yellow-400",
  green: "bg-green-500/10 text-green-400",
  red: "bg-red-500/10 text-red-400",
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: keyof typeof colorMap;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className={`mb-3 inline-flex rounded-lg p-2 ${iconBgMap[color]}`}>
        <Icon className="size-4" />
      </div>
      <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colorMap[color]}`} style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </p>
    </div>
  );
}
