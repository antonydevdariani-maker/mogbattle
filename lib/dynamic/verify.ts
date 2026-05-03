import { createRemoteJWKSet, jwtVerify } from "jose";

const ENV_ID = process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID;

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (_jwks) return _jwks;
  if (!ENV_ID) throw new Error("Set NEXT_PUBLIC_DYNAMIC_ENV_ID");
  _jwks = createRemoteJWKSet(
    new URL(`https://app.dynamic.xyz/api/v0/sdk/${ENV_ID}/.well-known/jwks`)
  );
  return _jwks;
}

/** Verify Dynamic auth token; returns Dynamic user ID (sub claim). */
export async function verifyDynamicAccessToken(accessToken: string | null | undefined): Promise<string> {
  if (!accessToken?.trim()) throw new Error("Unauthorized");
  const { payload } = await jwtVerify(accessToken, getJwks());
  const userId = payload.sub;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}
