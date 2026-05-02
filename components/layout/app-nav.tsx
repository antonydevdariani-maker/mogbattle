"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Wallet,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  Shield,
  FlaskConical,
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
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/spin", label: "Spin", icon: Atom },
  { href: "/arena", label: "Arena", icon: Shield },
  { href: "/admin", label: "Admin", icon: FlaskConical },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const matchAtRisk = useArenaMatchLeaveRisk();
  const { logout, authenticated, getAccessToken } = usePrivy();
  const [credits, setCredits] = useState(0);
  const [molecules, setMolecules] = useState(0);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const row = await loadProfileSummary(token);
        setCredits(row?.total_credits ?? 0);
        setMolecules(row?.molecules ?? 0);
      } catch {
        setCredits(0);
      }
    })();
  }, [authenticated, getAccessToken, pathname]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    }
    if (walletMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [walletMenuOpen]);

  const hasCredits = credits > 0;

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

    if (item.href === "/wallet" && hasCredits) {
      return {
        icon: item.icon,
        label: item.label,
        active,
        onClick: () => setWalletMenuOpen((o) => !o),
      };
    }

    return {
      icon: item.icon,
      label: item.label,
      active,
      onClick: () => tryNavigate(item.href),
    };
  });

  if (matchAtRisk) return null;

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

        {/* Dock + wallet dropdown — always centered */}
        <div className="relative flex justify-center" ref={menuRef}>
          <Dock items={dockItems} className="w-auto" />

          {/* Wallet quick menu */}
          {walletMenuOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-44 border border-white/10 bg-zinc-950 shadow-[4px_4px_0_#000] z-50">
              <button
                onClick={() => {
                  setWalletMenuOpen(false);
                  tryNavigate("/wallet?action=deposit");
                }}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300 hover:bg-fuchsia-500/10 hover:text-fuchsia-300 transition-colors border-b border-white/10"
              >
                <ArrowDownLeft className="size-3.5 text-fuchsia-400" />
                Deposit
              </button>
              <button
                onClick={() => {
                  setWalletMenuOpen(false);
                  tryNavigate("/wallet?action=withdraw");
                }}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <ArrowUpRight className="size-3.5 text-red-400" />
                Withdraw
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex items-center gap-1.5 border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1.5">
              <Atom className="size-3 text-cyan-400" />
              <span className="text-xs font-black tabular-nums text-white" style={{ fontFamily: "var(--font-heading)" }}>
                {molecules.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-1.5">
              <Zap className="size-3.5 text-fuchsia-400" />
              <span className="text-sm font-black tabular-nums text-white" style={{ fontFamily: "var(--font-heading)" }}>
                {credits.toLocaleString()}
              </span>
              <span className="text-xs text-zinc-600 font-bold uppercase">MC</span>
            </div>
          </div>
          <button
            type="button"
            className="border border-white/10 text-zinc-500 hover:text-white hover:border-white/30 px-3 h-9 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
            onClick={() => {
              if (matchAtRisk && !window.confirm(ARENA_LEAVE_WARNING)) return;
              logout();
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
