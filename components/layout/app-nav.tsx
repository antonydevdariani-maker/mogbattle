"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { LayoutDashboard, LogOut, Swords, Wallet, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dock } from "@/components/ui/dock-two";
import { loadProfileSummary } from "@/app/actions";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/battle", label: "Battle", icon: Swords },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, authenticated, getAccessToken } = usePrivy();
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const row = await loadProfileSummary(token);
        setCredits(row?.total_credits ?? 0);
      } catch {
        setCredits(0);
      }
    })();
  }, [authenticated, getAccessToken, pathname]);

  const dockItems = navItems.map((item) => {
    const inBattleFlow =
      item.href === "/battle" &&
      (pathname.startsWith("/battle") || pathname.startsWith("/match"));
    const active =
      inBattleFlow ||
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`);
    return {
      icon: item.icon,
      label: item.label,
      active,
      onClick: () => router.push(item.href),
    };
  });

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md pt-safe">
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:h-16 sm:grid-cols-[1fr_minmax(0,auto)_1fr] sm:gap-3 sm:px-4">
        <Link
          href="/dashboard"
          className="justify-self-start text-base font-bold uppercase tracking-widest"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          MOG<span className="text-primary">BATTLE</span>
        </Link>

        <div className="flex justify-center min-w-0">
          <Dock items={dockItems} className="w-auto max-w-[min(100vw-6rem,28rem)]" />
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/8 px-3 py-1.5 sm:flex",
              "shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_12%,transparent)]"
            )}
          >
            <Zap className="size-3.5 text-primary" />
            <span
              className="text-sm font-semibold tabular-nums text-foreground"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {credits.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">MC</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => logout()}
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
