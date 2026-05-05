"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { ensureProfile } from "@/app/actions";
import { AppNav } from "@/components/layout/app-nav";
import { ArenaMatchLeaveProvider } from "@/components/arena/arena-match-leave-context";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { session, user, token, loaded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!loaded) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [loaded, session, router, pathname]);

  // Ensure profile exists once authenticated
  useEffect(() => {
    if (!loaded || !session || !user || !token) return;
    const username = user.user_metadata?.username ?? user.email?.split("@")[0] ?? "mogger";
    ensureProfile(token, { walletAddress: null, username }).catch(() => null);
  }, [loaded, session, user, token]);

  if (!loaded || !session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
          Loading arena…
        </div>
      </div>
    );
  }

  return (
    <ArenaMatchLeaveProvider>
      <AppNav />
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6" style={{ overflowX: "clip" }}>
        {children}
      </div>
      <footer className="border-t border-white/5 py-3 text-center">
        <a
          href="mailto:support@omogger.com"
          className="text-[11px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          support@omogger.com
        </a>
      </footer>
    </ArenaMatchLeaveProvider>
  );
}
