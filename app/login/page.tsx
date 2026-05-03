"use client";

import { Suspense } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Swords } from "lucide-react";

function LoginContent() {
  const { sdkHasLoaded, isAuthenticated, setShowAuthFlow } = useDynamicContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    if (sdkHasLoaded && isAuthenticated) {
      router.replace(next);
    }
  }, [sdkHasLoaded, isAuthenticated, router, next]);

  if (!sdkHasLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-600 text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px),
            linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-sm space-y-8 border border-white/10 bg-zinc-950 p-8">
        <div className="absolute -top-px -left-px w-8 h-8 border-t-2 border-l-2 border-fuchsia-500" />
        <div className="absolute -bottom-px -right-px w-8 h-8 border-b-2 border-r-2 border-fuchsia-500" />

        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-400 font-bold">MogBattle</p>
          <h1 className="text-4xl font-black text-white uppercase" style={{ fontFamily: "var(--font-heading)" }}>
            Begin
          </h1>
          <p className="text-sm text-zinc-500">
            Face off 1v1. Bet. Mog or be mogged.
          </p>
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 h-14 bg-fuchsia-500 text-black text-base font-black uppercase tracking-widest shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
          onClick={() => setShowAuthFlow(true)}
        >
          <Swords className="size-5" />
          Connect
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-zinc-600 text-xs uppercase tracking-widest">
          Loading…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
