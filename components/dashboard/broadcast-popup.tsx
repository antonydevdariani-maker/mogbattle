"use client";

import { useEffect, useState } from "react";
import { X, Megaphone } from "lucide-react";

type Broadcast = {
  id: string;
  message: string;
  sender_username: string;
  created_at: string;
};

export function BroadcastPopup() {
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
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="border border-fuchsia-500/40 bg-zinc-950 shadow-[4px_4px_0_#a21caf] p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-fuchsia-400 shrink-0 mt-0.5" />
            <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400">
              Message from {broadcast.sender_username}
            </span>
          </div>
          <button
            onClick={dismiss}
            className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed pl-6">{broadcast.message}</p>
      </div>
    </div>
  );
}
