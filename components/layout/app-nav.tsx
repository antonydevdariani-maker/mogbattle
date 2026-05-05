"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Zap,
  Shield,
  Crown,
  User,
  MessageSquare,
  Atom,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Dock } from "@/components/ui/dock-two";
import { loadProfileSummary } from "@/app/actions";
import {
  ARENA_LEAVE_WARNING,
  useArenaMatchLeaveRisk,
} from "@/components/arena/arena-match-leave-context";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/leaderboard", label: "Ranks", icon: Crown },
  { href: "/arena", label: "Battle", icon: Shield },
  { href: "/spin", label: "Spin", icon: Atom },
  { href: "/profile", label: "Profile", icon: User },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const matchAtRisk = useArenaMatchLeaveRisk();
  const { token, session, signOut, user } = useAuth();
  const [molecules, setMolecules] = useState(0);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !token) return;
    (async () => {
      try {
        const row = await loadProfileSummary(token);
        setMolecules(row?.molecules ?? 0);
        setUsername(row?.username ?? null);
      } catch {
        setMolecules(0);
      }
    })();
  }, [session, token, pathname]);

  function tryNavigate(href: string) {
    if (!matchAtRisk) {
      router.push(href);
      return;
    }
    const pathOnly = href.split("?")[0];
    if (pathname === pathOnly || pathname.startsWith(`${pathOnly}/`)) {
      router.push(href);
      return;
    }
    if (window.confirm(ARENA_LEAVE_WARNING)) {
      router.push(href);
    }
  }

  const dockItems = navItems.map((item) => {
    const inBattleFlow =
      (item.href === "/arena" || item.href === "/battle") &&
      (pathname.startsWith("/arena") || pathname.startsWith("/battle") || pathname.startsWith("/match"));
    const active =
      inBattleFlow ||
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`);

    return {
      icon: item.icon,
      label: item.label,
      active,
      onClick: () => tryNavigate(item.href),
    };
  });

  if (matchAtRisk) return null;

  const isAdmin = username === "4kxo" || username === "vibecodedthis";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black pt-safe">
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4">
        <Link
          href="/dashboard"
          className="justify-self-start text-sm font-black uppercase tracking-widest hidden sm:block"
          style={{ fontFamily: "var(--font-heading)" }}
          onClick={(e) => {
            if (!matchAtRisk) return;
            e.preventDefault();
            tryNavigate("/dashboard");
          }}
        >
          OMOG<span className="text-fuchsia-400">GER</span>
        </Link>
        <div className="justify-self-start sm:hidden" />

        <div className="relative flex justify-center">
          <Dock items={dockItems} className="w-auto" />
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          {/* Molecules balance */}
          <div className="hidden items-center gap-1.5 border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 sm:flex">
            <Zap className="size-3.5 text-cyan-400" />
            <span
              className="text-sm font-black tabular-nums text-white"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {molecules.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-600 font-bold uppercase">mol</span>
          </div>

          {isAdmin && (
            <button
              type="button"
              className="border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20 px-3 h-9 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
              onClick={() => tryNavigate("/messages")}
            >
              <MessageSquare className="size-3.5" />
              <span className="hidden sm:inline">Messages</span>
            </button>
          )}

          <button
            type="button"
            className="border border-white/10 text-zinc-500 hover:text-white hover:border-white/30 px-3 h-9 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
            onClick={() => {
              if (matchAtRisk && !window.confirm(ARENA_LEAVE_WARNING)) return;
              signOut();
            }}
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
