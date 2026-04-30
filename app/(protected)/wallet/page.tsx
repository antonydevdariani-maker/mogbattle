"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { cashOutCredits, loadWalletData } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { WalletForm } from "@/components/wallet/wallet-form";
import { SolanaReceiveCard } from "@/components/wallet/solana-receive-card";
import { ClaimUsdcDeposit } from "@/components/wallet/claim-usdc-deposit";
import { FEE_RECIPIENT_WALLET, PLATFORM_FEE_FRACTION, USDC_MINT_MAINNET, USER_CREDIT_FRACTION } from "@/lib/wallet/usdc-deposit";
import { Zap, ArrowUpRight, Info } from "lucide-react";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

export default function WalletPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const refresh = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const data = await loadWalletData(token);
    setBalance(data.balance);
    setTransactions(data.transactions as Transaction[]);
  }, [getAccessToken]);

  useEffect(() => {
    if (!authenticated) return;
    void refresh();
  }, [authenticated, refresh]);

  return (
    <div className="w-full space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-6 shadow-[0_0_40px_color-mix(in_srgb,var(--primary)_8%,transparent)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 40%, var(--primary) 0%, transparent 55%)`,
          }}
        />
        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Mog Credits balance
            </p>
          </div>
          <p
            className="text-5xl font-bold tabular-nums text-foreground"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {balance.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Pulled from Supabase · 1 credit ≈ $1 USDC face at deposit</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-6">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="text-base font-medium leading-relaxed text-foreground">
                Send <span className="text-primary">USDC (Solana)</span> to your embedded address below.
              </p>
              <p className="leading-relaxed">
                After your on-chain USDC is in this wallet, use <strong className="text-foreground">Claim deposit</strong> to
                move the <strong>20% platform fee</strong> in USDC to <code className="text-xs text-primary/90">{FEE_RECIPIENT_WALLET}</code> and
                receive <strong className="text-foreground">{(100 * USER_CREDIT_FRACTION).toFixed(0)}%</strong> of the amount
                you enter as <strong className="text-foreground">Mog Credits</strong> ({PLATFORM_FEE_FRACTION * 100}% platform fee).
              </p>
            </div>
          </div>

          <SolanaReceiveCard />

          <p className="text-xs text-muted-foreground/90">
            Token: USDC · Mint <code className="break-all text-primary/80">{USDC_MINT_MAINNET}</code>
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card/50 p-6">
          <h2 className="text-sm font-semibold tracking-wide text-foreground">Claim deposit (MVP)</h2>
          <p className="text-sm text-muted-foreground">
            Enter the <strong className="text-foreground">gross USDC</strong> you’re converting. We take{" "}
            {PLATFORM_FEE_FRACTION * 100}% in USDC on-chain; you get{" "}
            {USER_CREDIT_FRACTION * 100}% as Mog Credits after the transaction confirms.
          </p>
          <ClaimUsdcDeposit onSettled={refresh} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-destructive/10 p-2">
            <ArrowUpRight className="size-4 text-destructive" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Test cash out</h2>
            <p className="text-xs text-muted-foreground">Simulated — does not move USDC on-chain</p>
          </div>
        </div>
        <WalletForm
          onSubmitAction={async (fd) => {
            const token = await getAccessToken();
            if (!token) throw new Error("Not signed in");
            await cashOutCredits(token, fd);
            await refresh();
          }}
          cta="Cash out (simulated)"
          variant="cashout"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Transaction history</h2>
          <span className="text-xs text-muted-foreground">{transactions.length} entries</span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No transactions yet.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className={`shrink-0 rounded-md p-1.5 ${
                      tx.type === "deposit" ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {tx.type === "deposit" ? "↓" : "↑"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize text-foreground">{tx.type}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{tx.tx_signature ?? "—"}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      tx.type === "deposit" ? "text-green-300" : "text-red-300"
                    }`}
                  >
                    {tx.type === "deposit" ? "+" : "-"}
                    {tx.amount.toLocaleString()} MC
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{tx.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
