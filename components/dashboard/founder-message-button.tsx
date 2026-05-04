"use client";

import { useState } from "react";
import { getAuthToken } from "@dynamic-labs/sdk-react-core";
import { Megaphone, X, Send, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function FounderMessageButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!message.trim() || sending) return;
    const token = getAuthToken();
    if (!token) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: message.trim() }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 border border-yellow-500/50 bg-yellow-500/10 text-yellow-300 px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-black uppercase tracking-wide hover:bg-yellow-500/20 transition-colors"
      >
        <Megaphone className="size-3" />
        <span>Message</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md px-4"
            >
              <div className="border border-yellow-500/40 bg-zinc-950 shadow-[4px_4px_0_#a16207] p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="size-4 text-yellow-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-yellow-400">
                      Broadcast to All Users
                    </span>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Input */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                  }}
                  placeholder="Type your message to all moggers…"
                  rows={3}
                  maxLength={280}
                  className="w-full resize-none border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-yellow-500/60 focus:outline-none"
                />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-zinc-600 tabular-nums">
                    {message.length}/280
                  </span>
                  <div className="flex items-center gap-2">
                    {error && (
                      <span className="text-[10px] text-red-400">{error}</span>
                    )}
                    {sent && (
                      <span className="text-[10px] text-green-400 font-black uppercase tracking-widest">Sent!</span>
                    )}
                    <button
                      onClick={() => void send()}
                      disabled={!message.trim() || sending || sent}
                      className="flex items-center gap-1.5 bg-yellow-500 text-black px-3 py-1.5 text-xs font-black uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
                    >
                      {sending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Send className="size-3" />
                      )}
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
