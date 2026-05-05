"use client";

import { useAuth } from "@/components/auth/auth-context";
import { useEffect, useState } from "react";
import { loadProfileSummary } from "@/app/actions";
import { Send, CheckCircle2 } from "lucide-react";

const ALLOWED = ["4kxo", "vibecodedthis"];

export default function MessagesPage() {
  const { session, token: authToken } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !authToken) return;
    (async () => {
      try {
        const row = await loadProfileSummary(authToken);
        setUsername(row?.username ?? null);
      } catch { /* ignore */ }
    })();
  }, [session, authToken]);

  if (!username) {
    return <p className="text-zinc-500 text-sm">Loading...</p>;
  }

  if (!ALLOWED.includes(username)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-600 text-sm">Access denied.</p>
      </div>
    );
  }

  async function handleSend() {
    if (!message.trim() || !authToken) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? "Send failed");
      }
      setMessage("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-6 pt-4">
      <div>
        <h1
          className="text-2xl font-black text-white uppercase tracking-widest"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Broadcast Message
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Sent to all users as a pop-up on their dashboard.
        </p>
      </div>

      <div className="border border-white/10 bg-zinc-950 p-5 space-y-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message to all users..."
          rows={4}
          className="w-full bg-zinc-900 border border-white/10 text-white text-sm p-3 placeholder-zinc-600 resize-none focus:outline-none focus:border-fuchsia-500/50"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="flex items-center gap-2 px-5 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black uppercase tracking-widest transition-colors"
        >
          {sent ? (
            <>
              <CheckCircle2 className="size-4" />
              Sent!
            </>
          ) : (
            <>
              <Send className="size-4" />
              {sending ? "Sending..." : "Broadcast"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
