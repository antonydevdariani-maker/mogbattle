import Link from "next/link";
import type { ComponentType } from "react";
import { Sword, Zap, Trophy, Flame, Shield, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function getHomeStats(): Promise<{ accounts: number; battles: number; wagered: number }> {
  try {
    const supabase = getSupabaseAdmin();
    const [{ count: accounts }, { count: battles }, { data: wageredData }] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("matches").select("bet_amount").eq("status", "completed"),
    ]);
    const wagered = (wageredData ?? []).reduce((sum, m) => sum + (Number(m.bet_amount) * 2), 0);
    return { accounts: accounts ?? 0, battles: battles ?? 0, wagered };
  } catch {
    return { accounts: 0, battles: 0, wagered: 0 };
  }
}

export default async function Home() {
  const { accounts: accountCount, battles, wagered } = await getHomeStats();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 relative overflow-hidden bg-black">
      {/* Grid bg */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px),
            linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <main className="relative w-full max-w-5xl">
        {/* Hero */}
        <div className="text-center mb-14 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-none border border-red-500 bg-transparent px-4 py-1.5 text-xs tracking-widest text-red-400 uppercase font-bold">
            <span className="inline-block size-1.5 rounded-full bg-red-500 animate-pulse" />
            Live arena — real stakes
          </div>

          <h1
            className="text-6xl font-black tracking-tight md:text-8xl leading-none uppercase"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            MOG OR BE
            <br />
            <span className="text-yellow-400">MOGGED</span>
          </h1>

          <p className="text-zinc-500 text-lg max-w-xl mx-auto leading-relaxed">
            Step into the arena. Bet Mog Credits. Let the AI judge your face.
            Winner takes the pot. No excuses.
          </p>

          <div className="flex justify-center">
            <Link
              href="/begin"
              className={cn(
                "inline-flex items-center justify-center font-black text-lg px-16 h-14 uppercase tracking-widest",
                "bg-yellow-500 text-black",
                "shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
              )}
            >
              Begin
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 divide-x divide-white/10 border border-white/10 bg-zinc-950 mb-10">
          {[
            { value: battles.toLocaleString(), label: "Battles Fought" },
            { value: wagered >= 1000 ? `${(wagered / 1000).toFixed(1)}K` : wagered.toLocaleString(), label: "MC Wagered" },
            { value: accountCount.toLocaleString(), label: "Moggers" },
          ].map((s) => (
            <div key={s.label} className="py-7 text-center">
              <p
                className="text-3xl font-black text-yellow-400 tabular-nums"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {s.value}
              </p>
              <p className="text-xs text-zinc-600 mt-1 uppercase tracking-widest font-bold">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-px md:grid-cols-3 bg-white/10">
          <Feature icon={Sword} title="1v1 Live Battles" desc="Real-time matchmaking. Face your opponent." />
          <Feature icon={Zap} title="AI Judgment" desc="6 metrics analyzed. No bias. No mercy." />
          <Feature icon={Trophy} title="ELO Ranking" desc="Climb the ladder. Prove dominance." />
          <Feature icon={Flame} title="Degen Energy" desc="High stakes. Instant payouts. Adrenaline." />
          <Feature icon={Shield} title="Mog Credits" desc="Deposit, withdraw, and stack your bag." />
          <Feature icon={TrendingUp} title="Win Streaks" desc="Go on a run. Demoralize the field." />
        </div>
      </main>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-zinc-950 p-5 hover:bg-zinc-900 transition-colors group">
      <Icon className="mb-3 size-5 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
      <p className="text-sm font-bold text-white mb-1 uppercase tracking-wide">{title}</p>
      <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}
