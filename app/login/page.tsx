"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Swords } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";

function LoginContent() {
  const { session, loaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (loaded && session) {
      router.replace(next);
    }
  }, [loaded, session, router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // session change handled by AuthProvider → redirect happens via useEffect
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username || email.split("@")[0] } },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        setSuccess("Account created! Signing you in…");
        // Auto sign in after signup
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          setLoading(false);
        }
      }
    }
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-600 text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-sm space-y-6 border border-white/10 bg-zinc-950 p-8">
        <div className="absolute -top-px -left-px w-8 h-8 border-t-2 border-l-2 border-yellow-500" />
        <div className="absolute -bottom-px -right-px w-8 h-8 border-b-2 border-r-2 border-yellow-500" />

        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <Swords className="size-8 text-yellow-400" />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-yellow-400 font-bold">Omogger</p>
          <h1 className="text-2xl font-black text-white uppercase" style={{ fontFamily: "var(--font-heading)" }}>
            {mode === "login" ? "Sign In" : "Create Account"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="mogger123"
                className="w-full border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
              className="w-full border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 font-bold border border-red-500/30 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-green-400 font-bold border border-green-500/30 bg-green-500/10 px-3 py-2">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 h-12 bg-yellow-500 text-black text-sm font-black uppercase tracking-widest shadow-[4px_4px_0_#fff] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0_#fff]"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-widest text-zinc-600">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError("");
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
              },
            });
            if (error) { setError(error.message); setLoading(false); }
          }}
          className="flex w-full items-center justify-center gap-3 h-12 border border-white/10 bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 hover:border-white/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg className="size-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest"
          >
            {mode === "login" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
          {mode === "login" && (
            <button
              type="button"
              onClick={async () => {
                if (!email) { setError("Enter your email first."); return; }
                setLoading(true);
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/login`,
                });
                setLoading(false);
                if (error) setError(error.message);
                else setSuccess("Password reset email sent. Check your inbox.");
              }}
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-600 text-xs uppercase tracking-widest">
        Loading…
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
