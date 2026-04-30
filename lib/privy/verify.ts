import { PrivyClient } from "@privy-io/server-auth";

let _privy: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (_privy) return _privy;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) {
    throw new Error("Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET");
  }
  _privy = new PrivyClient(appId, secret);
  return _privy;
}

/** Verify Privy access token from `getAccessToken()`; returns Privy user DID. */
export async function verifyPrivyAccessToken(accessToken: string | null | undefined): Promise<string> {
  if (!accessToken?.trim()) {
    throw new Error("Unauthorized");
  }
  const claims = await getPrivyClient().verifyAuthToken(accessToken);
  return claims.userId;
}
