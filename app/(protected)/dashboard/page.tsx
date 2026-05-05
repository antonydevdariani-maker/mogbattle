"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-context";
import { useEffect, useState } from "react";
import { loadDashboardData } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { Swords, TrendingUp, Trophy, Atom, Crown, Zap } from "lucide-react";
import { BroadcastBanner } from "@/components/dashboard/broadcast-popup";
import { FounderMessageButton } from "@/components/dashboard/founder-message-button";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];

export default function DashboardPage() {
  const { session, token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !token) return;
    (async () => {
      try {
        const data = await loadDashboardData(token);
        setProfile(data.profile as Profile | null);
        setMatches((data.matches ?? []) as Match[]);
        setUserId(data.userId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [session, token]);

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
      <BroadcastBanner />

      <a
        href="https://discord.gg/HukF2sh2"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 border border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-3 hover:bg-[#5865F2]/20 transition-colors group"
      >
        <svg className="size-5 shrink-0 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-[#5865F2]">Join our Discord</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Connect with the mogger community</p>
        </div>
        <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-[#5865F2]/60 group-hover:text-[#5865F2] transition-colors shrink-0">Join →</span>
      </a>

      <div className="relative border border-white/10 bg-zinc-950 p-6">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-yellow-500" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-yellow-500" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-zinc-600 font-bold">Arena Identity</p>
            <h1
              className="mb-1 text-3xl font-black text-white uppercase truncate max-w-[200px]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {profile?.username ?? "…"}
            </h1>
            <p className="text-sm text-zinc-500">
              <span className="font-bold text-yellow-400">{profile?.elo ?? 1500}</span> ELO
              {" · "}
              <span className="text-cyan-300">{(profile?.molecules ?? 0).toLocaleString()} mol</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {profile?.is_founder && <FounderMessageButton />}
            <Link
              href="/spin"
              className="flex items-center gap-1 border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-black uppercase tracking-wide hover:bg-cyan-500/20 transition-colors"
            >
              <Atom className="size-3" />
              <span>Spin</span>
            </Link>
            <Link
              href="/arena"
              className="flex items-center gap-1 bg-yellow-500 text-black px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-black uppercase tracking-wide shadow-[2px_2px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
            >
              <Swords className="size-3" />
              <span>Battle</span>
            </Link>
            <Link
              href="/leaderboard"
              className="hidden sm:flex items-center gap-1 border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              <Crown className="size-3" />
              Ranks
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px md:grid-cols-4 bg-white/10">
        <StatCard icon={Zap} label="Molecules" value={(profile?.molecules ?? 0).toLocaleString()} accent="cyan" />
        <StatCard icon={TrendingUp} label="ELO Rating" value={String(profile?.elo ?? 1500)} accent="blue" />
        <StatCard icon={Trophy} label="Wins" value={String(profile?.wins ?? 0)} accent="yellow" />
        <StatCard icon={Swords} label="Win Rate" value={`${winRate}%`} accent={winRate >= 50 ? "green" : "red"} />
      </div>

      {matches.length > 0 && userId && (
        <div className="border border-white/10 bg-zinc-950">
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
                    {won ? `+${m.bet_amount * 2}` : `-${m.bet_amount}`} mol
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="border border-dashed border-white/10 bg-zinc-950/30 p-12 text-center">
          <Swords className="mx-auto mb-3 size-8 text-zinc-700" />
          <p className="text-sm text-zinc-500 uppercase tracking-widest">No battles yet.</p>
          <Link href="/arena" className="mt-4 inline-block text-sm font-black text-yellow-400 hover:text-yellow-300 uppercase tracking-widest">
            Enter the pit →
          </Link>
        </div>
      )}
    </div>
  );
}

const accentMap = {
  cyan:    { text: "text-cyan-400",    border: "border-cyan-500/30",    icon: "text-cyan-400" },
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
