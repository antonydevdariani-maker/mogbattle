import { FaceReportClient } from "@/components/face-report/face-report-client";
import { Scan } from "lucide-react";

export default function FaceReportPage() {
  return (
    <div className="w-full flex flex-col items-center gap-6 py-4">
      <div className="text-center space-y-2 w-full max-w-lg">
        <div className="flex justify-center mb-3">
          <div className="flex size-12 items-center justify-center border border-fuchsia-500/40 bg-fuchsia-500/10">
            <Scan className="size-6 text-fuchsia-400" />
          </div>
        </div>
        <h1
          className="text-3xl sm:text-4xl font-black uppercase text-white leading-tight"
          style={{ fontFamily: "var(--font-ibm-plex-mono)", textShadow: "0 0 30px rgba(217,70,239,0.4)" }}
        >
          Face <span className="text-fuchsia-400">Report</span>
        </h1>
        <p className="text-zinc-500 text-xs uppercase tracking-widest">
          AI-powered deep facial analysis · $5 USDC · Instant
        </p>
      </div>

      <FaceReportClient />
    </div>
  );
}
