import type { User } from "@privy-io/react-auth";

export function getLinkedWalletAddress(user: User | null | undefined): string | null {
  if (!user) return null;
  const w = user.wallet;
  if (w?.address) return w.address;
  for (const a of user.linkedAccounts ?? []) {
    if (a.type === "wallet" && "address" in a && typeof (a as { address?: string }).address === "string") {
      return (a as { address: string }).address;
    }
  }
  return null;
}

export function deriveProfileUsername(user: User | null | undefined): string {
  if (!user) return "mogger";
  const addr = getLinkedWalletAddress(user);
  if (addr) return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  if (user.email?.address) return user.email.address.split("@")[0] ?? "mogger";
  if (user.google?.email) return user.google.email.split("@")[0] ?? "mogger";
  return "mogger";
}
