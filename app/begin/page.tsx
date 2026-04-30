"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion } from "framer-motion";
import { Swords } from "lucide-react";

export default function BeginPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (ready && authenticated) router.replace("/dashboard");
  }, [ready, authenticated, router]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px),
            linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm space-y-10 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.35 }}
          className="flex justify-center"
        >
          <div className="flex size-20 items-center justify-center border border-fuchsia-500 bg-fuchsia-500/10">
            <Swords className="size-9 text-fuchsia-400" />
          </div>
        </motion.div>

        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-400 font-bold">MogBattle</p>
          <h1
            className="text-5xl font-black leading-tight text-white uppercase sm:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Connect &amp;
            <br />
            <span className="text-fuchsia-400">Start</span>
          </h1>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Wallet created automatically. Face off 1v1. Bet. Mog or be mogged.
          </p>
        </div>

        <div className="space-y-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => login()}
            className="w-full py-5 bg-fuchsia-500 text-black text-lg font-black uppercase tracking-widest shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
          >
            Let&apos;s go
          </motion.button>
          <button
            onClick={() => router.back()}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-widest"
          >
            Go back
          </button>
        </div>
      </motion.div>
    </div>
  );
}
