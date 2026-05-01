"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ARENA_LEAVE_WARNING =
  "You have an active match. If you leave now, you will automatically forfeit and lose. Continue?";

type ArenaMatchLeaveContextValue = {
  matchAtRisk: boolean;
  setMatchAtRisk: (v: boolean) => void;
};

const ArenaMatchLeaveContext = createContext<ArenaMatchLeaveContextValue | null>(null);

export function ArenaMatchLeaveProvider({ children }: { children: ReactNode }) {
  const [matchAtRisk, setMatchAtRisk] = useState(false);
  const value = useMemo(() => ({ matchAtRisk, setMatchAtRisk }), [matchAtRisk]);
  return <ArenaMatchLeaveContext.Provider value={value}>{children}</ArenaMatchLeaveContext.Provider>;
}

export function useArenaMatchLeaveRisk() {
  return useContext(ArenaMatchLeaveContext)?.matchAtRisk ?? false;
}

export function useArenaMatchLeaveSetters() {
  const ctx = useContext(ArenaMatchLeaveContext);
  return { setMatchAtRisk: ctx?.setMatchAtRisk ?? ((() => {}) as (v: boolean) => void) };
}

/** Browser tab close / refresh warning while a match is active. */
export function useWarnBeforeUnloadIf(shouldWarn: boolean) {
  useEffect(() => {
    if (!shouldWarn) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldWarn]);
}
