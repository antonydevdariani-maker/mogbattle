"use client";

import { isFounder } from "@/lib/founders";

export function FounderBadge({ username, className = "" }: { username: string | null | undefined; className?: string }) {
  if (!isFounder(username)) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm border border-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300 shrink-0 ${className}`}
      title="Founder"
    >
      👑 FOUNDER
    </span>
  );
}
