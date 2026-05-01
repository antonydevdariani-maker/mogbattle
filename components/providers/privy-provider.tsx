"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { defaultSolanaRpcsPlugin, toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

export function MogBattlePrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-red-300">
        Missing NEXT_PUBLIC_PRIVY_APP_ID (got: {String(appId)})
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "email", "google"],
        appearance: {
          theme: "dark",
          accentColor: "#8c5cff",
          walletChainType: "ethereum-and-solana",
        },
        plugins: [defaultSolanaRpcsPlugin()],
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
