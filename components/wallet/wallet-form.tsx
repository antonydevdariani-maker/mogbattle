"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2500];

export function WalletForm({
  onSubmitAction,
  cta,
  variant,
}: {
  onSubmitAction: (formData: FormData) => Promise<void>;
  cta: string;
  variant: "deposit" | "cashout";
}) {
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setPending(true);
        try {
          const fd = new FormData();
          fd.set("amount", amount || "0");
          await onSubmitAction(fd);
          setAmount("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {QUICK_AMOUNTS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
              amount === String(v)
                ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {v.toLocaleString()}
          </button>
        ))}
      </div>

      <Input
        name="amount"
        type="number"
        min={1}
        step={1}
        placeholder="Custom amount..."
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-9 border-zinc-700 bg-zinc-900/60"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button
        type="submit"
        disabled={pending}
        className={`h-9 w-full font-semibold ${
          variant === "deposit"
            ? "bg-green-600 text-white hover:bg-green-500"
            : "bg-red-600 text-white hover:bg-red-500"
        }`}
      >
        {pending ? "Processing…" : cta}
      </Button>
    </form>
  );
}
