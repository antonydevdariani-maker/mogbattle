"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
// SolanaWalletConnectors temporarily removed to diagnose SDK init issue
// import { SolanaWalletConnectors } from "@dynamic-labs/solana";

export function MogBattleDynamicProvider({ children }: { children: React.ReactNode }) {
  const envId = process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID;
  if (!envId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-red-300">
        Missing NEXT_PUBLIC_DYNAMIC_ENV_ID
      </div>
    );
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId: envId,
        walletConnectors: [],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
