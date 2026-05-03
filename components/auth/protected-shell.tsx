"use client";

import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter, usePathname } from "next/navigation";
import { ensureProfile, loadProfileSummary } from "@/app/actions";
import { deriveProfileUsername } from "@/lib/dynamic/user-display";
import { AppNav } from "@/components/layout/app-nav";
import { WalletSetupHud } from "@/components/wallet/wallet-setup-hud";
import { ArenaMatchLeaveProvider } from "@/components/arena/arena-match-leave-context";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { sdkHasLoaded, isAuthenticated, user, primaryWallet, authToken } = useDynamicContext();
  const router = useRouter();
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!sdkHasLoaded) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [sdkHasLoaded, isAuthenticated, router, pathname]);

  useEffect(() => {
    if (!sdkHasLoaded || !isAuthenticated || !user || !authToken) return;
    (async () => {
      const walletAddress = primaryWallet?.address ?? null;
      const username = deriveProfileUsername(walletAddress, user.email);
      await ensureProfile(authToken, { walletAddress, username });
      const profile = await loadProfileSummary(authToken);
      setCredits(profile?.total_credits ?? 0);

      if (pathname !== "/verify") {
        const verified = localStorage.getItem(`mogbattle_verified_${user.userId}`);
        if (!verified) {
          router.replace("/verify");
        }
      }
    })();
  }, [sdkHasLoaded, isAuthenticated, user, primaryWallet?.address, authToken, pathname, router]);

  if (!sdkHasLoaded || !isAuthenticated) {
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
