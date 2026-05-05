"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";

export default function BeginPage() {
  const { session, loaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loaded) return;
    if (session) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [loaded, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-zinc-600 text-xs uppercase tracking-widest">
      Loading…
    </div>
  );
}
