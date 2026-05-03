"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { LivenessCheck } from "@/components/verify/liveness-check";
import { Shield } from "lucide-react";

export default function VerifyPage() {
  const router = useRouter();
  const { user } = useDynamicContext();

  const handleVerified = useCallback(() => {
    if (user?.userId) {
      localStorage.setItem(`mogbattle_verified_${user.userId}`, "1");
    }
    router.replace("/dashboard");
  }, [user?.userId, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="flex size-14 items-center justify-center border border-fuchsia-500/40 bg-fuchsia-500/10">
            <Shield className="size-7 text-fuchsia-400" />
          </div>
        </div>
        <h1
          className="text-3xl sm:text-4xl font-black uppercase text-white leading-tight"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 30px rgba(217,70,239,0.5)" }}
        >
          Identity <span className="text-fuchsia-400">Check</span>
        </h1>
        <p className="text-zinc-500 text-xs uppercase tracking-widest max-w-xs mx-auto">
          One-time verification — proves you&apos;re a real person, not a photo or filter
        </p>
      </div>

      <LivenessCheck onVerified={handleVerified} />
    </div>
  );
}
