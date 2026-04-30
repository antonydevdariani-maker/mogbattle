"use client";

import { useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import bs58 from "bs58";
import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { buildUsdcFeeTransferTxBytes } from "@/lib/solana/build-usdc-fee-tx";
import { recordUsdcDepositClaim } from "@/app/actions";
import { FEE_RECIPIENT_WALLET, USDC_MINT_MAINNET, mogCreditsFromGrossUsdc, PLATFORM_FEE_FRACTION } from "@/lib/wallet/usdc-deposit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";

const MAINNET = "solana:mainnet" as const;
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

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
  const rpc = typeof window !== "undefined" && process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    : DEFAULT_RPC;

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
    const owner = new PublicKey(solWallet.address);
    const connection = new Connection(rpc, "confirmed");
    let signatureBase58: string;
    try {
      const { transactionBytes } = await buildUsdcFeeTransferTxBytes({
        owner,
        grossUsdc: gross,
        connection,
      });
      const { signature } = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: solWallet,
        chain: MAINNET,
        options: { sponsor: true },
      });
      signatureBase58 = bs58.encode(signature);
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
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200/90">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Mainnet USDC only. If Privy cannot sponsor this transaction, you need a small amount of SOL
              in this same wallet for fees.
            </p>
          </div>
          <Label className="text-foreground" htmlFor="usdc-claim">
            Amount of USDC you are claiming (gross)
          </Label>
          <Input
            id="usdc-claim"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-border bg-card font-mono text-foreground"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            type="button"
            onClick={openSummary}
            disabled={!valid || netMc < 1}
            className="w-full bg-primary font-semibold text-primary-foreground"
          >
            <Sparkles className="mr-2 size-4" />
            Claim deposit & convert to Mog Credits
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
