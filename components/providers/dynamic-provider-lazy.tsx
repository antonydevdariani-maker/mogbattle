"use client";

import dynamic from "next/dynamic";

// Skip SSR entirely — Dynamic SDK accesses `window` at import time
export const MogBattleDynamicProviderLazy = dynamic(
  () =>
    import("./dynamic-provider").then((m) => ({
      default: m.MogBattleDynamicProvider,
    })),
  { ssr: false }
);
