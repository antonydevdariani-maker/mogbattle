"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadWalletData } from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { ClaimUsdcDeposit } from "@/components/wallet/claim-usdc-deposit";
import { WithdrawUsdcPanel } from "@/components/wallet/withdraw-usdc";
import { QRCodeSVG } from "qrcode.react";
import { Zap, Copy, Check, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

function WalletPageInner() {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copied, setCopied] = useState(false);
  const searchParams = useSearchParams();
  const actionParam = searchParams.get("action");
  const [section, setSection] = useState<"deposit" | "withdraw">(
    actionParam === "withdraw" ? "withdraw" : "deposit"
  );
  const walletTabsRef = useRef<HTMLDivElement>(null);

  const address = wallets[0]?.address;

  useEffect(() => {
    setSection(actionParam === "withdraw" ? "withdraw" : "deposit");
  }, [actionParam]);

  useEffect(() => {
    if (section !== "withdraw") return;
    const id = requestAnimationFrame(() => {
      walletTabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [section]);

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

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">

      {/* Credits balance */}
      <div className="relative border border-white/10 bg-zinc-950 p-6">
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-fuchsia-500" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-fuchsia-500" />
        <div className="flex items-center gap-2 mb-1">
          <Zap className="size-4 text-fuchsia-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-600">Mog Credits</p>
        </div>
        <p
          className="text-6xl font-black tabular-nums text-white"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {balance.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-zinc-600 uppercase tracking-widest">1 credit ≈ $1 USDC</p>
      </div>

      {/* Wallet address + QR */}
      <div className="border border-white/10 bg-zinc-950">
        <div className="border-b border-white/10 px-5 py-3">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Your Wallet</p>
        </div>
        <div className="p-5 space-y-4">
          {walletsReady && address ? (
            <>
              <div className="flex items-start gap-2">
                <p className="font-mono text-xs text-zinc-400 break-all flex-1 leading-relaxed">{address}</p>
                <button
                  onClick={copyAddress}
                  className="shrink-0 flex items-center gap-1.5 border border-white/10 bg-zinc-900 hover:border-fuchsia-500/50 hover:text-fuchsia-300 text-zinc-400 text-xs font-bold uppercase tracking-widest px-3 py-2 transition-colors"
                >
                  {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="flex justify-center pt-1">
                <div className="border border-white/10 p-3 bg-white">
                  <QRCodeSVG value={address} size={160} level="H" bgColor="#ffffff" fgColor="#000000" />
                </div>
              </div>
              <p className="text-center text-xs text-zinc-600 uppercase tracking-widest">USDC · Solana</p>
            </>
          ) : (
            <p className="text-sm text-zinc-600">Loading wallet…</p>
          )}
        </div>
      </div>

      {/* Deposit / Withdraw tabs — scroll target for withdraw tab / OUT history rows */}
      <div ref={walletTabsRef} id="wallet-withdraw" className="scroll-mt-24 border border-white/10 bg-zinc-950">
        <div className="grid grid-cols-2 divide-x divide-white/10 border-b border-white/10">
          <button
            onClick={() => setSection("deposit")}
            className={`flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
              section === "deposit" ? "bg-fuchsia-500/10 text-fuchsia-400" : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <ArrowDownLeft className="size-3.5" />
            Deposit
          </button>
          <button
            onClick={() => setSection("withdraw")}
            className={`flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
              section === "withdraw" ? "bg-red-500/10 text-red-400" : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <ArrowUpRight className="size-3.5" />
            Withdraw
          </button>
        </div>
        <div className="p-5">
          {section === "deposit" ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Send <span className="text-fuchsia-400 font-bold">USDC (Solana)</span> to your address above, then claim below. 20% platform fee applies.
              </p>
              <ClaimUsdcDeposit onSettled={refresh} />
            </div>
          ) : (
            <WithdrawUsdcPanel balance={balance} onSettled={refresh} />
          )}
        </div>
      </div>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div className="border border-white/10 bg-zinc-950">
          <div className="border-b border-white/10 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">History</p>
            <span className="text-xs text-zinc-700">{transactions.length} entries</span>
          </div>
          <div className="divide-y divide-white/5">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                role={tx.type === "withdraw" ? "button" : undefined}
                tabIndex={tx.type === "withdraw" ? 0 : undefined}
                onClick={tx.type === "withdraw" ? () => setSection("withdraw") : undefined}
                onKeyDown={
                  tx.type === "withdraw"
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSection("withdraw");
                        }
                      }
                    : undefined
                }
                className={`flex items-center justify-between gap-2 px-5 py-3 ${
                  tx.type === "withdraw"
                    ? "cursor-pointer hover:bg-red-500/5 transition-colors"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black uppercase px-2 py-0.5 border ${
                    tx.type === "deposit"
                      ? "border-green-500/50 text-green-400 bg-green-500/5"
                      : "border-red-500/50 text-red-400 bg-red-500/5"
                  }`}>
                    {tx.type === "deposit" ? "IN" : "OUT"}
                  </span>
                  <p className="font-mono text-xs text-zinc-600 truncate max-w-[120px]">{tx.tx_signature ?? "—"}</p>
                </div>
                <p className={`text-sm font-black tabular-nums ${tx.type === "deposit" ? "text-green-400" : "text-red-400"}`}>
                  {tx.type === "deposit" ? "+" : "-"}{tx.amount.toLocaleString()} MC
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="text-zinc-600 text-xs uppercase tracking-widest py-20 text-center">Loading…</div>}>
      <WalletPageInner />
    </Suspense>
  );
}
