import { getSupabaseAdmin } from "./admin";

/** Verify a Supabase access token; returns the Supabase user ID. */
export async function verifySupabaseToken(
  token: string | null | undefined
): Promise<string> {
  if (!token?.trim()) throw new Error("Unauthorized");
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user?.id) throw new Error("Unauthorized");
  return user.id;
}
