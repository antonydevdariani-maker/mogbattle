"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  token: string | null;
  loaded: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  token: null,
  loaded: false,
  signOut: async () => {},
  refreshSession: async () => null,
});

// Single instance outside component — recreating inside causes subscription leaks
// that accumulate until auth state goes stale and server actions start throwing Unauthorized
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoaded(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    setSession(data.session);
    return data.session;
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      token: session?.access_token ?? null,
      loaded,
      signOut,
      refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
