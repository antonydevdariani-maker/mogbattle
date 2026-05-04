"use client";

import { useEffect, useState } from "react";
import { X, Megaphone } from "lucide-react";

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

  if (!visible || !broadcast) return null;

  return (
    <div className="border border-fuchsia-500/40 bg-fuchsia-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Megaphone className="size-4 text-fuchsia-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400 block">
              Message from {broadcast.sender_username}
            </span>
            <p className="text-sm text-zinc-200 leading-relaxed mt-0.5">{broadcast.message}</p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

// Keep old name as alias so nothing else breaks
export { BroadcastBanner as BroadcastPopup };
