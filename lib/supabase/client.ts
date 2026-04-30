"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseCredentials } from "@/lib/supabase/env";
import type { Database } from "@/lib/types/database";

export function createClient() {
  const { url, anonKey } = getSupabaseCredentials();
  return createBrowserClient<Database>(url, anonKey);
}
