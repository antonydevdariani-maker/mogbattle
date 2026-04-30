"use client";

import { Suspense } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Wallet, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    if (ready && authenticated) {
      router.replace(next);
    }
  }, [ready, authenticated, router, next]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(oklch(0.72 0.26 305) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.72 0.26 305) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative w-full max-w-md space-y-8 rounded-2xl border border-fuchsia-500/25 bg-zinc-950/90 p-8 shadow-[0_0_60px_oklch(0.72_0.26_305/0.2)]">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-red-400">MogBattle</p>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
            Connect to play
          </h1>
          <p className="text-sm text-zinc-500">
            Phantom / Solflare / MetaMask + email or Google fallback.
          </p>
        </div>

        <Button
          type="button"
          className="h-14 w-full bg-gradient-to-r from-fuchsia-600 to-pink-600 text-base font-bold text-white hover:from-fuchsia-500 hover:to-pink-500"
          onClick={() => login({ loginMethods: ["wallet"] })}
        >
          <Wallet className="size-5" />
          Connect Wallet to Play
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-zinc-950 px-2 text-zinc-600">Or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-zinc-700 text-zinc-200"
          onClick={() => login({ loginMethods: ["email", "google"] })}
        >
          <Mail className="size-4" />
          Email / Google
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
          Loading…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
