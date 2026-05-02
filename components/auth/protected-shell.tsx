"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { ensureProfile, loadProfileSummary } from "@/app/actions";
import { deriveProfileUsername, getLinkedWalletAddress } from "@/lib/privy/user-display";
import { AppNav } from "@/components/layout/app-nav";
import { WalletSetupHud } from "@/components/wallet/wallet-setup-hud";
import { ArenaMatchLeaveProvider } from "@/components/arena/arena-match-leave-context";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [ready, authenticated, router, pathname]);

  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const wallet = getLinkedWalletAddress(user);
      const username = deriveProfileUsername(user);
      await ensureProfile(token, { walletAddress: wallet, username });
      const profile = await loadProfileSummary(token);
      setCredits(profile?.total_credits ?? 0);

      // Gate: unverified users must complete liveness check before anything else
      if (pathname !== "/verify") {
        const verified = localStorage.getItem(`mogbattle_verified_${user.id}`);
        if (!verified) {
          router.replace("/verify");
        }
      }
    })();
  }, [ready, authenticated, user, user?.wallet?.address, user?.id, getAccessToken, pathname, router]);

  if (!ready || !authenticated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
          Loading arena…
        </div>
      </div>
    );
  }

  const showHud = credits !== null && credits === 0 && pathname !== "/wallet";

  return (
    <ArenaMatchLeaveProvider>
      <AppNav />
      <WalletSetupHud show={showHud} />
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6" style={{ overflowX: "clip" }}>{children}</div>
      <footer className="border-t border-white/5 py-3 text-center">
        <a href="mailto:support@omogger.com" className="text-[11px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors">
          support@omogger.com
        </a>
      </footer>
    </ArenaMatchLeaveProvider>
  );
}
