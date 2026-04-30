"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
        {error.message || "Something broke in the arena."}
      </p>
      <Button onClick={reset}>Try Again</Button>
    </div>
  );
}
