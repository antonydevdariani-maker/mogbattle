"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, X, ArrowRight } from "lucide-react";
import { useState } from "react";

export function WalletSetupHud({ show }: { show: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {show && !dismissed && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="w-full border-b border-fuchsia-500/30 bg-zinc-950"
        >
          <div className="mx-auto flex h-11 max-w-6xl items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2.5">
              <Wallet className="size-3.5 text-fuchsia-400 shrink-0" />
              <p className="text-xs font-bold text-zinc-300 uppercase tracking-wide">
                Want to set up your wallet to play?
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/wallet")}
                className="flex items-center gap-1 bg-fuchsia-500 text-black text-xs font-black uppercase tracking-widest px-3 h-7 shadow-[2px_2px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                Set up
                <ArrowRight className="size-3" />
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
