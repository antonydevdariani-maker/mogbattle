"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, X } from "lucide-react";

export default function BeginPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (ready && authenticated) router.replace("/dashboard");
  }, [ready, authenticated, router]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4">
      {/* Grid bg */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(oklch(0.72 0.26 305) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.72 0.26 305) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      {/* Glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-[600px] rounded-full bg-fuchsia-600/10 blur-[120px]" />
      </div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg space-y-10 text-center"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="flex justify-center"
        >
          <div className="flex size-20 items-center justify-center rounded-3xl border border-fuchsia-500/30 bg-fuchsia-500/10 shadow-[0_0_40px_oklch(0.72_0.26_305/0.25)]">
            <Swords className="size-9 text-fuchsia-400" />
          </div>
        </motion.div>

        {/* Heading */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.25em] text-red-400 font-medium">MogBattle</p>
          <h1
            className="text-5xl font-bold leading-tight text-white sm:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Connect your wallet
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-pink-400 to-rose-400">
              and start
            </span>
          </h1>
          <p className="text-zinc-500 text-base leading-relaxed max-w-sm mx-auto">
            A wallet is created for you automatically. Face off 1v1. Bet. Mog or be mogged.
          </p>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setSheetOpen(true)}
            className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-pink-600 py-5 text-lg font-bold text-white hover:from-fuchsia-500 hover:to-pink-500 transition-all shadow-[0_0_40px_oklch(0.72_0.26_305/0.35)]"
          >
            Let's go
          </motion.button>
          <button
            onClick={() => router.back()}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Go back
          </button>
        </div>
      </motion.div>

      {/* Bottom sheet overlay */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 z-20 bg-black/70 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-30 rounded-t-3xl border-t border-fuchsia-500/20 bg-zinc-950 px-6 pb-10 pt-6 shadow-[0_-20px_60px_oklch(0.72_0.26_305/0.2)]"
            >
              {/* Handle */}
              <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-zinc-700" />

              {/* Close */}
              <button
                onClick={() => setSheetOpen(false)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="size-5" />
              </button>

              <div className="space-y-7">
                <div className="space-y-2 text-center">
                  <h2
                    className="text-3xl font-bold text-white"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Sign in
                  </h2>
                  <p className="text-sm text-zinc-500">Choose how you want to enter the arena</p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => { setSheetOpen(false); login(); }}
                    className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-pink-600 py-4 text-base font-bold text-white hover:from-fuchsia-500 hover:to-pink-500 transition-all"
                  >
                    Continue with Email or Google
                  </button>
                  <button
                    onClick={() => { setSheetOpen(false); login(); }}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 py-4 text-base font-semibold text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                  >
                    Connect Wallet
                  </button>
                </div>

                <p className="text-center text-xs text-zinc-600">
                  New here? An account is created automatically.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
