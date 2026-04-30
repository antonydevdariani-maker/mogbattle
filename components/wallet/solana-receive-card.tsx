"use client";

import { useWallets } from "@privy-io/react-auth/solana";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { USDC_MINT_MAINNET } from "@/lib/wallet/usdc-deposit";

export function SolanaReceiveCard() {
  const { wallets, ready } = useWallets();
  const [copied, setCopied] = useState(false);
  const address = wallets[0]?.address;

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading Solana wallet…</p>;
  }
  if (!address) {
    return null;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[auto,1fr] md:items-start">
      <div className="mx-auto flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4">
        <QRCodeSVG
          value={address}
          size={200}
          level="H"
          className="rounded-lg"
          includeMargin
          bgColor="var(--card)"
          fgColor="var(--foreground)"
        />
        <span className="text-xs text-muted-foreground">Scan to copy address</span>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Your embedded Solana address</p>
        <p className="break-all font-mono text-sm leading-relaxed text-muted-foreground">{address}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={copy} className="font-mono text-xs">
            {copied ? <Check className="mr-1 size-3" /> : <Copy className="mr-1 size-3" />}
            {copied ? "Copied" : "Copy address"}
          </Button>
        </div>
        <div className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">USDC (SPL) mint on Solana mainnet:</span>
            <br />
            <code className="text-xs break-all text-primary">{USDC_MINT_MAINNET}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
