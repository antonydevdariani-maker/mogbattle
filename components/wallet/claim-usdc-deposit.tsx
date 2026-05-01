"use client";

import { useState } from "react";
import bs58 from "bs58";
import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { recordUsdcDepositClaim, buildDepositTransaction } from "@/app/actions";
import { FEE_RECIPIENT_WALLET, USDC_MINT_MAINNET, mogCreditsFromGrossUsdc, PLATFORM_FEE_FRACTION } from "@/lib/wallet/usdc-deposit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";

const MAINNET = "solana:mainnet" as const;

function usdcToDisplay(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

type Props = { onSettled: () => Promise<void> };

export function ClaimUsdcDeposit({ onSettled }: Props) {
  const { getAccessToken, ready: privyReady, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [amount, setAmount] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [step, setStep] = useState<"form" | "summary">("form");
  const [pending, setPending] = useState<"create" | "send" | "server" | false>(false);
  const [error, setError] = useState<string | null>(null);

  const solWallet = wallets[0] ?? null;
  const parsed = parseFloat(amount.replace(/,/g, "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const gross = valid ? parsed : 0;
  const feeUsdc = gross * PLATFORM_FEE_FRACTION;
  const netMc = gross > 0 ? mogCreditsFromGrossUsdc(gross) : 0;
  async function handleCreateSolana() {
    setError(null);
    setPending("create");
    try {
      await createWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create wallet");
    } finally {
      setPending(false);
    }
  }

  function openSummary() {
    if (!valid || netMc < 1) {
      setError("Enter an amount that yields at least 1 Mog Credit after the 20% fee (try $5+).");
      return;
    }
    setError(null);
    setStep("summary");
    setSummaryOpen(true);
  }

  async function runClaim() {
    if (!solWallet || !walletsReady) {
      setError("Connect a Solana wallet (embedded) first.");
      return;
    }
    setError(null);
    setPending("send");
    const token = await getAccessToken();
    if (!token) {
      setPending(false);
      setError("Not signed in.");
      return;
    }
    let signatureBase58: string;
    try {
      const { transactionBase64 } = await buildDepositTransaction(token, {
        grossUsdc: gross,
        ownerAddress: solWallet.address,
      });
      const transactionBytes = Uint8Array.from(Buffer.from(transactionBase64, "base64"));
      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: solWallet,
        chain: MAINNET,
        options: { sponsor: true },
      });
      const sig = (result as { signature: unknown }).signature;
      signatureBase58 = typeof sig === "string" ? sig : bs58.encode(sig as Uint8Array);
    } catch (e) {
      setPending(false);
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg + " — If gas sponsorship is off, keep a small SOL balance in this wallet for network fees."
      );
      return;
    }

    setPending("server");
    try {
      await recordUsdcDepositClaim(token, { grossUsdc: gross, txSignature: signatureBase58 });
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : "Could not record deposit");
      return;
    } finally {
      setPending(false);
    }

    setSummaryOpen(false);
    setStep("form");
    setAmount("");
    await onSettled();
  }

  return (
    <div className="space-y-4">
      {(!privyReady || !walletsReady) && (
        <p className="text-xs text-muted-foreground">Loading wallet…</p>
      )}

      {authenticated && walletsReady && !solWallet && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm text-foreground">Create your embedded Solana wallet to move USDC on mainnet.</p>
          <Button
            type="button"
            className="mt-2 bg-primary text-primary-foreground"
            onClick={handleCreateSolana}
            disabled={pending === "create"}
          >
            {pending === "create" ? "Creating…" : "Create Solana wallet"}
          </Button>
        </div>
      )}

      {solWallet && (
        <div className="space-y-3">
          {/* Warning box */}
          <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90 leading-relaxed">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <p className="font-bold text-amber-300">⚠️ Mainnet USDC (Solana) only.</p>
              <p>Make sure you have enough SOL in your wallet for transaction fees.</p>
              <p className="text-amber-400 font-bold">Wrong network = lost funds. Double-check before sending.</p>
            </div>
          </div>

          <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400" htmlFor="usdc-claim">
            Amount of USDC sent (gross)
          </Label>
          <Input
            id="usdc-claim"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-zinc-700 bg-zinc-900/60 font-mono text-zinc-200"
          />
          <p className="text-[11px] text-zinc-600">Example: 100 USDC → You receive 80 Mog Coins after 20% fee</p>

          {/* Live fee breakdown */}
          {valid && gross > 0 && (
            <div className="border border-white/10 bg-zinc-900/50 p-3 space-y-1.5 text-xs">
              <p className="font-bold uppercase tracking-widest text-zinc-500 text-[10px] mb-2">Fee Breakdown</p>
              <div className="flex justify-between text-zinc-400">
                <span>Gross sent</span>
                <span className="font-mono text-white">{gross.toLocaleString()} USDC</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Platform fee (20%)</span>
                <span className="font-mono text-red-400">−{feeUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span>
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold">
                <span className="text-zinc-300">Mog Coins you will receive</span>
                <span className="font-mono text-fuchsia-400">{netMc.toLocaleString()} MC</span>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button
            type="button"
            onClick={openSummary}
            disabled={!valid || netMc < 1}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 font-black uppercase tracking-widest text-white"
          >
            {pending ? (
              <><Loader2 className="mr-2 size-4 animate-spin" /> Processing…</>
            ) : (
              <><Sparkles className="mr-2 size-4" /> I Have Sent — Credit My Account</>
            )}
          </Button>
        </div>
      )}

      {summaryOpen && step === "summary" && solWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => {
              if (!pending) {
                setSummaryOpen(false);
                setStep("form");
              }
            }}
          />
          <div
            className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl"
            role="dialog"
            aria-labelledby="claim-summary-title"
          >
            <h2 id="claim-summary-title" className="text-lg font-semibold">
              Confirm on-chain claim
            </h2>
            <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">USDC model</span>
                <br />
                Mint:{" "}
                <code className="text-xs text-primary break-all">{USDC_MINT_MAINNET}</code>
              </p>
              <p className="text-base">
                You are claiming:{" "}
                <span className="font-mono font-semibold text-foreground">
                  ${usdcToDisplay(gross)} USDC
                </span>{" "}
                total
              </p>
              <p>
                The transaction will move{" "}
                <span className="font-mono text-primary">
                  ${usdcToDisplay(feeUsdc)} USDC
                </span>{" "}
                (20%) to:{" "}
                <code className="text-xs break-all text-muted-foreground">{FEE_RECIPIENT_WALLET}</code>
              </p>
              <p>
                You will receive:{" "}
                <span className="text-lg font-bold text-primary">
                  {netMc.toLocaleString()} Mog Credits
                </span>{" "}
                (80% of gross, 1:1 to USDC)
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              We request fee sponsorship from Privy when available. You still sign the SPL transfer. Your
              wallet must hold the gross USDC balance you enter (the chain enforces the 20% move).
            </p>
            {error && (
              <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-border"
                disabled={!!pending}
                onClick={() => {
                  setSummaryOpen(false);
                  setStep("form");
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 bg-primary font-bold text-primary-foreground"
                disabled={!!pending}
                onClick={() => void runClaim()}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {pending === "server" ? "Finalizing…" : "Sign in wallet…"}
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
