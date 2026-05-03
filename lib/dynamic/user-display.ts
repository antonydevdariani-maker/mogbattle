export function deriveProfileUsername(walletAddress: string | null | undefined, email?: string | null): string {
  if (walletAddress) return `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`;
  if (email) return email.split("@")[0] ?? "mogger";
  return "mogger";
}
