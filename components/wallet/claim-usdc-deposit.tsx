"use client";

import { useState } from "react";
import { getAuthToken, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { VersionedTransaction } from "@solana/web3.js";
import { recordUsdcDepositClaim, buildDepositTransaction } from "@/app/actions";
import { mogCreditsFromGrossUsdc, PLATFORM_FEE_FRACTION } from "@/lib/wallet/usdc-deposit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";

function usdcToDisplay(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

type Props = { onSettled: () => Promise<void> };

export function ClaimUsdcDeposit({ onSettled }: Props) {
  const { primaryWallet, sdkHasLoaded, user } = useDynamicContext();
  const authToken = getAuthToken();
  const isAuthenticated = useIsLoggedIn();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "summary">("form");
  const [pending, setPending] = useState<"send" | "server" | false>(false);
  const [error, setError] = useState<string | null>(null);

  const solWallet = primaryWallet && isSolanaWallet(primaryWallet) ? primaryWallet : null;
  const parsed = parseFloat(amount.replace(/,/g, "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const gross = valid ? parsed : 0;
  const feeUsdc = gross * PLATFORM_FEE_FRACTION;
  const netMc = gross > 0 ? mogCreditsFromGrossUsdc(gross) : 0;

  function openSummary() {
    if (!valid || netMc < 1) {
      setError("Enter an amount that yields at least 1 Mog Credit after the 20% fee (try $5+).");
      return;
    }
    setError(null);
    setStep("summary");
  }

  async function runClaim() {
    if (!solWallet || !authToken) {
      setError("Wallet or session not ready.");
      return;
    }
    setError(null);
    setPending("send");

    let signature: string;
    try {
      const { transactionBase64 } = await buildDepositTransaction(authToken, {
        grossUsdc: gross,
        ownerAddress: solWallet.address,
      });
      const txBytes = Buffer.from(transactionBase64, "base64");
      const tx = VersionedTransaction.deserialize(txBytes);
      const signer = await solWallet.getSigner();
      const result = await signer.signAndSendTransaction(tx as never);
      signature = result.signature;
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    setPending("server");
    try {
      await recordUsdcDepositClaim(authToken, { grossUsdc: gross, txSignature: signature });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record deposit");
      return;
    } finally {
      setPending(false);
    }

    setStep("form");
    setAmount("");
    await onSettled();
  }

  return (
    <div className="space-y-4">
      {(!sdkHasLoaded) && (
        <p className="text-xs text-muted-foreground">Loading wallet…</p>
      )}

      {isAuthenticated && sdkHasLoaded && !solWallet && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm text-foreground">Your embedded Solana wallet is being created — refresh in a moment.</p>
        </div>
      )}

      {solWallet && (
        <div className="space-y-4">
          {step === "form" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USDC)</Label>
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="10.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                  className="font-mono"
                />
              </div>

              {valid && gross > 0 && (
                <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform fee (20%)</span>
                    <span className="font-mono text-foreground">−${usdcToDisplay(feeUsdc)} USDC</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>You receive</span>
                    <span className="text-fuchsia-400 font-mono">{netMc.toLocaleString()} MC</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button onClick={openSummary} disabled={!valid} className="w-full">
                Review deposit
              </Button>
            </>
          )}

          {step === "summary" && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-fuchsia-500/50 bg-fuchsia-500/5 p-5 text-center space-y-2">
                <Sparkles className="mx-auto size-8 text-fuchsia-400" />
                <p className="text-lg font-black text-white">{netMc.toLocaleString()} Mog Credits</p>
                <p className="text-sm text-zinc-400">for ${usdcToDisplay(gross)} USDC</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setStep("form")} disabled={!!pending}>
                  Back
                </Button>
                <Button onClick={runClaim} disabled={!!pending} className="bg-fuchsia-500 text-black font-black">
                  {pending === "send" ? (
                    <><Loader2 className="mr-2 size-4 animate-spin" /> Signing…</>
                  ) : pending === "server" ? (
                    <><Loader2 className="mr-2 size-4 animate-spin" /> Confirming…</>
                  ) : (
                    "Confirm & Deposit"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
