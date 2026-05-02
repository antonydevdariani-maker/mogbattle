import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SpinClient } from "@/components/spin/spin-client";
import { loadSpinData } from "@/app/actions";

export default async function SpinPage() {
  // Access token comes from cookie set by Privy on the client; use a server action fallback
  return <SpinClient />;
}
