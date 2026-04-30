"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { ensureProfile } from "@/app/actions";
import { deriveProfileUsername, getLinkedWalletAddress } from "@/lib/privy/user-display";
import { AppNav } from "@/components/layout/app-nav";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();

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
    })();
  }, [ready, authenticated, user, user?.wallet?.address, user?.id, getAccessToken]);

  if (!ready || !authenticated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
          Loading arena…
        </div>
      </div>
    );
  }

  return (
    <>
      <AppNav />
      <div className="mx-auto flex w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</div>
    </>
  );
}
