"use client";

import { useEffect, useState } from "react";
import { X, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Broadcast = {
  id: string;
  message: string;
  sender_username: string;
  created_at: string;
};

export function BroadcastBanner() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/broadcasts");
        const json = await res.json() as { broadcast: Broadcast | null };
        if (!json.broadcast) return;

        const dismissed = JSON.parse(localStorage.getItem("dismissed_broadcasts") ?? "[]") as string[];
        if (dismissed.includes(json.broadcast.id)) return;

        setBroadcast(json.broadcast);
        setVisible(true);
      } catch { /* ignore */ }
    })();
  }, []);

  function dismiss() {
    if (!broadcast) return;
    const dismissed = JSON.parse(localStorage.getItem("dismissed_broadcasts") ?? "[]") as string[];
    dismissed.push(broadcast.id);
    localStorage.setItem("dismissed_broadcasts", JSON.stringify(dismissed));
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && broadcast && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="border-2 border-yellow-400/70 bg-yellow-400/10 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 mt-0.5 border border-yellow-400/50 bg-yellow-400/10 p-2">
                <Megaphone className="size-5 text-yellow-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-yellow-400 block mb-1">
                  Message from {broadcast.sender_username}
                </span>
                <p className="text-base text-yellow-100 leading-relaxed font-medium">{broadcast.message}</p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="text-yellow-600 hover:text-yellow-300 transition-colors shrink-0 mt-0.5"
            >
              <X className="size-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Keep old name as alias so nothing else breaks
export { BroadcastBanner as BroadcastPopup };
