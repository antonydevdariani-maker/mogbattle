import type { User } from "@privy-io/react-auth";

export function deriveProfileUsername(user: User | null | undefined): string {
  if (!user) return "mogger";
  if (user.email?.address) return user.email.address.split("@")[0] ?? "mogger";
  if (user.google?.email) return user.google.email.split("@")[0] ?? "mogger";
  return "mogger";
}
