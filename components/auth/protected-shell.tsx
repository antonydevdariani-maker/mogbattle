"use client";

import { useEffect, useState } from "react";
import { getAuthToken, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter, usePathname } from "next/navigation";
import { ensureProfile, loadProfileSummary } from "@/app/actions";
import { deriveProfileUsername } from "@/lib/dynamic/user-display";
import { AppNav } from "@/components/layout/app-nav";
import { WalletSetupHud } from "@/components/wallet/wallet-setup-hud";
import { ArenaMatchLeaveProvider } from "@/components/arena/arena-match-leave-context";
import { X } from "lucide-react";

const TARGET_EMAIL = "urinbaevabaj@gmail.com";
const DISMISSED_KEY = "mogbattle_migration_notice_v1";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { sdkHasLoaded, user, primaryWallet } = useDynamicContext();
  const authToken = getAuthToken();
  const isAuthenticated = useIsLoggedIn();
  const router = useRouter();
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);
  const [showMigrationNotice, setShowMigrationNotice] = useState(false);

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

      if (user.email === TARGET_EMAIL && !localStorage.getItem(DISMISSED_KEY)) {
        setShowMigrationNotice(true);
      }

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
      {showMigrationNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-sm border border-fuchsia-500/40 bg-zinc-950 p-6 shadow-[4px_4px_0_#000]">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-fuchsia-500/80" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-fuchsia-500/80" />
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(DISMISSED_KEY, "1");
                setShowMigrationNotice(false);
              }}
              className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="size-4" />
            </button>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-500 mb-3">Platform update</p>
            <p className="text-sm font-bold text-white leading-relaxed mb-4">
              Hey — we recently switched our auth system and your account data was reset. Your progress will be fully restored by tomorrow. Sorry for the inconvenience, we&apos;ve got you covered.
            </p>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(DISMISSED_KEY, "1");
                setShowMigrationNotice(false);
              }}
              className="w-full bg-fuchsia-600 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-fuchsia-500 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
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
