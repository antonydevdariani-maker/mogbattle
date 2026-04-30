import Link from "next/link";
import type { ComponentType } from "react";
import { Sword, Zap, Trophy, Flame, Shield, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(oklch(0.72 0.26 305) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.72 0.26 305) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <main className="relative w-full max-w-5xl">
        <div className="text-center mb-14 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-xs tracking-widest text-red-300 uppercase font-medium">
            <span className="inline-block size-1.5 rounded-full bg-red-400 animate-pulse" />
            Live arena — real stakes
          </div>

          <h1
            className="text-6xl font-bold tracking-tight md:text-8xl leading-none"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            MOG OR BE
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-pink-400 to-rose-400">
              MOGGED
            </span>
          </h1>

          <p className="text-zinc-400 text-lg max-w-xl mx-auto leading-relaxed">
            Step into the arena. Bet Mog Credits. Let the AI judge your face.
            Winner takes the pot. No excuses.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold px-8 h-11 text-sm glow-fuchsia"
              )}
            >
              Connect Wallet to Play
            </Link>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-zinc-700 text-zinc-300 hover:text-white px-8 h-11 text-sm"
              )}
            >
              Arena
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px bg-zinc-800/40 rounded-2xl overflow-hidden mb-10 border border-zinc-800">
          {[
            { value: "1,247", label: "Battles Today" },
            { value: "84K", label: "Credits Wagered" },
            { value: "< 1s", label: "Avg Queue Time" },
          ].map((s) => (
            <div key={s.label} className="bg-zinc-950/90 py-6 text-center">
              <p
                className="text-3xl font-bold text-fuchsia-300"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {s.value}
              </p>
              <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 hover:border-fuchsia-500/30 transition-colors group">
      <Icon className="mb-3 size-5 text-fuchsia-400 group-hover:text-fuchsia-300 transition-colors" />
      <p className="text-sm font-semibold text-zinc-100 mb-1">{title}</p>
      <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}
