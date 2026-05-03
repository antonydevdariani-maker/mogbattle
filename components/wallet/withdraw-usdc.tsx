"use client";

import { useEffect, useState } from "react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAuthToken, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import {
  ensureProfile,
  buildWithdrawTransaction,
  recordWithdrawalClaim,
} from "@/app/actions";
import { USDC_MINT_MAINNET } from "@/lib/wallet/usdc-deposit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowDownToLine,
  Check,
  Copy,
  Loader2,
  ShieldAlert,
  Wallet,
} from "lucide-react";

const QUICK = [50, 100, 250, 500, 1000];

function isValidRecipient(addr: string, embedded: string): boolean {
  const t = addr.trim();
  if (!t) return false;
  try {
    const p = new PublicKey(t);
    return p.toBase58() !== new PublicKey(embedded).toBase58();
  } catch {
    return false;
  }
}

type Props = { balance: number; onSettled: () => Promise<void> };

export function WithdrawUsdcPanel({ balance, onSettled }: Props) {
  const { primaryWallet, sdkHasLoaded, user } = useDynamicContext();
  const authToken = getAuthToken();
  const isAuthenticated = useIsLoggedIn();

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [copiedEmb, setCopiedEmb] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pending, setPending] = useState<"send" | "server" | false>(false);
  const [error, setError] = useState<string | null>(null);

  const solWallet = primaryWallet && isSolanaWallet(primaryWallet) ? primaryWallet : null;
  const parsedAmt = parseInt(amount.replace(/,/g, ""), 10);
  const validAmt = Number.isFinite(parsedAmt) && parsedAmt >= 2 && Number.isInteger(parsedAmt);
  const amountOk = validAmt && parsedAmt <= balance;
  const destOk = solWallet ? isValidRecipient(destination, solWallet.address) : false;
  const canReview = amountOk && destOk && solWallet;

  const copyEmbedded = async () => {
    if (!solWallet?.address) return;
    await navigator.clipboard.writeText(solWallet.address);
    setCopiedEmb(true);
    setTimeout(() => setCopiedEmb(false), 2000);
  };

  const embeddedAddr = solWallet?.address;

  useEffect(() => {
    if (!isAuthenticated || !embeddedAddr || !authToken) return;
    void ensureProfile(authToken, { walletAddress: embeddedAddr });
  }, [isAuthenticated, embeddedAddr, authToken]);

  function openSummary() {
    if (!canReview) {
      if (!amountOk) setError("Minimum withdrawal is 2 MC. Enter an amount between 2 and your Mog Credit balance.");
      else if (!destOk) setError("Paste a valid Solana address (not your embedded Mog wallet).");
      return;
    }
    setError(null);
    setSummaryOpen(true);
  }

  async function runWithdraw() {
    if (!solWallet || !authToken) {
      setError("Wallet or session not ready.");
      return;
    }
    setError(null);
    setPending("send");
    const destTrim = destination.trim();
    let signatureBase58: string;
    try {
      const { transactionBase64 } = await buildWithdrawTransaction(authToken, {
        ownerAddress: solWallet.address,
        destinationAddress: destTrim,
        amountMc: parsedAmt,
      });
      const txBytes = Buffer.from(transactionBase64, "base64");
      const tx = VersionedTransaction.deserialize(txBytes);
      const signer = await solWallet.getSigner();
      const result = await signer.signAndSendTransaction(tx as never);
      signatureBase58 = result.signature;
    } catch (e) {
      setPending(false);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg + " — Your embedded wallet must hold enough USDC (same amount as Mog Credits).");
      return;
    }

    setPending("server");
    try {
      await recordWithdrawalClaim(authToken, {
        signature: signatureBase58,
        ownerAddress: solWallet.address,
        destinationAddress: destTrim,
        amountMc: parsedAmt,
      });
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : "Could not record withdrawal");
      return;
    } finally {
      setPending(false);
    }

    setSummaryOpen(false);
    setDestination("");
    setAmount("");
    await onSettled();
  }

  return (
    <div className="space-y-4">
      <div className="border border-cyan-500/25 bg-cyan-500/5 p-3 text-xs text-cyan-100/90 leading-relaxed space-y-2">
        <p className="font-black uppercase tracking-widest text-cyan-400/90 text-[10px]">Withdraw Mog Coins → USDC (Solana)</p>
        <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
          <li>
            We deduct <span className="text-white font-bold">Mog Credits</span> from your balance (1 MC = 1 USDC).
          </li>
          <li>
            <span className="text-white font-bold">USDC</span> is sent from your <span className="text-white font-bold">embedded Mog wallet</span> on Solana.
          </li>
          <li>
            Paste your <span className="text-white font-bold">personal Solana wallet</span> address and choose how much to send there.
          </li>
        </ol>
        <p className="text-zinc-500 pt-1">Withdrawal fee: <span className="text-white font-bold">0%</span> · Minimum withdrawal: <span className="text-white font-bold">2 MC</span></p>
      </div>

      {!sdkHasLoaded && (
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Loading wallet…</p>
      )}

      {isAuthenticated && sdkHasLoaded && !solWallet && (
        <div className="border border-white/10 bg-zinc-900/40 p-4">
          <p className="text-sm text-zinc-300">Your embedded Solana wallet is being created — refresh in a moment.</p>
        </div>
      )}

      {solWallet && (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Mainnet USDC only. Your embedded wallet must already hold enough USDC to cover this send (you cannot
              withdraw more USDC than is in that wallet). Keep a small amount of SOL for network fees.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              <Wallet className="size-3.5 text-fuchsia-400" />
              Embedded Mog wallet (sends USDC)
            </div>
            <div className="flex items-start gap-2 rounded border border-white/10 bg-zinc-900/50 p-3">
              <p className="font-mono text-[11px] text-zinc-300 break-all flex-1 leading-relaxed">
                {solWallet.address}
              </p>
              <button
                type="button"
                onClick={() => void copyEmbedded()}
                className="shrink-0 flex items-center gap-1 border border-white/10 bg-zinc-900 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:border-fuchsia-500/40 hover:text-fuchsia-300"
              >
                {copiedEmb ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
                {copiedEmb ? "OK" : "Copy"}
              </button>
            </div>
          </div>

          <div className="flex justify-center py-1 text-zinc-600">
            <ArrowDownToLine className="size-5" aria-hidden />
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-dest" className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Your personal Solana wallet
            </Label>
            <Input
              id="withdraw-dest"
              placeholder="Paste destination address (receives USDC)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="h-10 border-zinc-700 bg-zinc-900/60 font-mono text-xs text-zinc-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-amt" className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Amount (Mog Credits = USDC to send)
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.filter((q) => q <= balance).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className={`rounded border px-2.5 py-1 text-xs font-bold transition-colors ${
                    amount === String(v)
                      ? "border-red-500/60 bg-red-500/15 text-red-200"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {v.toLocaleString()}
                </button>
              ))}
              {balance >= 1 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(balance))}
                  className={`rounded border px-2.5 py-1 text-xs font-bold transition-colors ${
                    amount === String(balance)
                      ? "border-red-500/60 bg-red-500/15 text-red-200"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Max
                </button>
              )}
            </div>
            <Input
              id="withdraw-amt"
              type="text"
              inputMode="numeric"
              placeholder={`Min 2 · Max ${balance.toLocaleString()} MC`}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className="h-10 border-zinc-700 bg-zinc-900/60 font-mono text-zinc-200"
            />
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
              Balance: {balance.toLocaleString()} Mog Credits
            </p>
          </div>

          {error && !summaryOpen && <p className="text-xs text-red-400">{error}</p>}

          <Button
            type="button"
            onClick={openSummary}
            disabled={!canReview}
            className="h-10 w-full bg-red-600 font-black uppercase tracking-widest text-white hover:bg-red-500"
          >
            Review & send to personal wallet
          </Button>
        </>
      )}

      {summaryOpen && solWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => {
              if (!pending) {
                setSummaryOpen(false);
              }
            }}
          />
          <div
            className="relative z-10 w-full max-w-md space-y-4 border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="withdraw-summary-title"
          >
            <h2 id="withdraw-summary-title" className="text-lg font-black uppercase tracking-wide text-white">
              Confirm withdrawal
            </h2>
            <div className="space-y-3 rounded border border-white/10 bg-zinc-900/40 p-4 text-sm text-zinc-300">
              <p>
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Send</span>
                <br />
                <span className="text-2xl font-black tabular-nums text-white">{parsedAmt.toLocaleString()} USDC</span>
                <span className="text-zinc-500"> · {parsedAmt.toLocaleString()} MC deducted</span>
              </p>
              <p className="text-xs">
                <span className="text-zinc-500 font-bold uppercase tracking-widest">From (embedded)</span>
                <br />
                <code className="break-all text-[11px] text-fuchsia-300">{solWallet.address}</code>
              </p>
              <p className="text-xs">
                <span className="text-zinc-500 font-bold uppercase tracking-widest">To (your wallet)</span>
                <br />
                <code className="break-all text-[11px] text-cyan-300">{destination.trim()}</code>
              </p>
              <p className="text-[10px] text-zinc-600 break-all">Mint: {USDC_MINT_MAINNET}</p>
            </div>
            {error && (
              <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-zinc-600 bg-transparent text-zinc-300"
                disabled={!!pending}
                onClick={() => {
                  setSummaryOpen(false);
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 bg-red-600 font-black uppercase tracking-widest text-white hover:bg-red-500"
                disabled={!!pending}
                onClick={() => void runWithdraw()}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {pending === "server" ? "Recording…" : "Sign…"}
                  </>
                ) : (
                  "Sign & send"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
