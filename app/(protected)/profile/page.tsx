"use client";

import Link from "next/link";
import { getAuthToken, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadProfilePageData,
  updateProfileUsername,
  uploadProfileAvatar,
} from "@/app/actions";
import type { Database } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  Camera,
  Crown,
  Loader2,
  Mail,
  Swords,
  TrendingUp,
  Trophy,
  User as UserIcon,
  Wallet,
  Zap,
} from "lucide-react";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];

export default function ProfilePage() {
  const { user } = useDynamicContext();
  const authToken = getAuthToken();
  const isAuthenticated = useIsLoggedIn();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [userBusy, setUserBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!authToken) return;
    const data = await loadProfilePageData(authToken);
    setProfile(data.profile as Profile | null);
    setMatches((data.matches ?? []) as Match[]);
    setUserId(data.userId);
  }, [authToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    if (profile?.username) setUsernameDraft(profile.username);
  }, [profile?.username]);

  const winRate =
    profile && profile.matches_played > 0
      ? Math.round((profile.wins / profile.matches_played) * 100)
      : 0;
  const losses = (profile?.matches_played ?? 0) - (profile?.wins ?? 0);
  const email = user?.email ?? null;

  async function saveUsername() {
    setBanner(null);
    if (!authToken) return;
    setUserBusy(true);
    try {
      await updateProfileUsername(authToken, usernameDraft);
      await refresh();
      setBanner({ type: "ok", text: "Username saved." });
    } catch (e) {
      setBanner({ type: "err", text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setUserBusy(false);
    }
  }

  async function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !authToken) return;
    setBanner(null);
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.set("avatar", file);
      await uploadProfileAvatar(authToken, fd);
      await refresh();
      setBanner({ type: "ok", text: "Profile picture updated." });
    } catch (e) {
      setBanner({ type: "err", text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setAvatarBusy(false);
    }
  }

  if (err) {
    return <p className="text-red-400 text-sm">{err}</p>;
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-fuchsia-500/90">Profile</p>
            {profile?.is_founder && (
              <span className="inline-flex items-center gap-1 border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                ⚡ Founder
              </span>
            )}
          </div>
          <h1
            className="text-3xl font-black text-white uppercase tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Your mogger card
          </h1>
        </div>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-amber-200 hover:bg-amber-500/20 transition-colors"
        >
          <Crown className="size-3.5" />
          Leaderboard
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* Edit profile: photo + username */}
      <div className="relative border border-white/10 bg-zinc-950 p-6">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/80" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/80" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-4">Edit profile</p>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void onAvatarPick(e)}
            />
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
              className="group relative size-28 shrink-0 overflow-hidden border-2 border-fuchsia-500/50 bg-fuchsia-500/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 disabled:opacity-50"
            >
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <UserIcon className="size-12 text-fuchsia-300/80" />
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                {avatarBusy ? (
                  <Loader2 className="size-6 animate-spin text-white" />
                ) : (
                  <>
                    <Camera className="size-5 text-white" />
                    <span className="text-[9px] font-black uppercase text-white">Upload</span>
                  </>
                )}
              </div>
            </button>
            <p className="text-center text-[10px] text-zinc-600 uppercase tracking-widest sm:text-left">
              JPG · PNG · WebP · GIF · max 2MB
            </p>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Username
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="username"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  placeholder="Your arena name"
                  maxLength={32}
                  className="h-10 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-white sm:max-w-xs"
                />
                <Button
                  type="button"
                  disabled={userBusy || !usernameDraft.trim()}
                  onClick={() => void saveUsername()}
                  className="h-10 bg-fuchsia-600 font-black uppercase tracking-widest text-white hover:bg-fuchsia-500"
                >
                  {userBusy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>

            {profile?.wallet_address && (
              <p className="font-mono text-[11px] text-zinc-500 break-all">{profile.wallet_address}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href="/wallet"
                className="inline-flex items-center gap-2 border border-white/15 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-300 hover:border-fuchsia-500/40 hover:text-fuchsia-300"
              >
                <Wallet className="size-3.5" />
                Wallet
              </Link>
              <Link
                href="/arena"
                className="inline-flex items-center gap-2 bg-fuchsia-500 text-black px-3 py-2 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_#fff] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                <Swords className="size-3.5" />
                Arena
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="ELO" value={String(profile?.elo ?? 1500)} accent="text-amber-300" />
          <MiniStat label="W / L" value={`${profile?.wins ?? 0} / ${losses}`} accent="text-white" />
          <MiniStat label="Matches" value={String(profile?.matches_played ?? 0)} accent="text-zinc-300" />
          <MiniStat label="Win rate" value={`${winRate}%`} accent={winRate >= 50 ? "text-green-400" : "text-red-400"} />
        </div>

        <div className="mt-4 flex items-center gap-2 border border-white/10 bg-black/40 px-3 py-2">
          <Zap className="size-4 text-fuchsia-400 shrink-0" />
          <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Balance</span>
          <span className="text-lg font-black tabular-nums text-white" style={{ fontFamily: "var(--font-heading)" }}>
            {(profile?.total_credits ?? 0).toLocaleString()} MC
          </span>
        </div>

        {banner && (
          <p className={`mt-3 text-xs font-bold ${banner.type === "ok" ? "text-green-400" : "text-red-400"}`}>
            {banner.text}
          </p>
        )}
      </div>

      {/* Email (optional) */}
      <div className="border border-white/10 bg-zinc-950">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Email</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <Mail className="size-4 shrink-0" />
            <span className="text-xs font-black uppercase tracking-widest">Linked address</span>
          </div>
          <p className="text-sm text-zinc-300 break-all">{email ?? "No email linked yet."}</p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="size-4 text-zinc-500" />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Recent battles</h2>
        </div>
        {matches.length > 0 && userId ? (
          <div className="border border-white/10 bg-zinc-950 divide-y divide-white/5">
            {matches.map((m) => {
              const won = m.winner_id === userId;
              const myScore = m.player1_id === userId ? m.ai_score_p1 : m.ai_score_p2;
              const oppScore = m.player1_id === userId ? m.ai_score_p2 : m.ai_score_p1;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 text-xs font-black uppercase px-2 py-0.5 border ${
                        won
                          ? "border-green-500 text-green-400 bg-green-500/5"
                          : "border-red-500 text-red-400 bg-red-500/5"
                      }`}
                    >
                      {won ? "W" : "L"}
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums truncate">
                      {myScore?.toFixed(1) ?? "—"} vs {oppScore?.toFixed(1) ?? "—"}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-black tabular-nums ${won ? "text-green-400" : "text-zinc-600"}`}
                  >
                    {won ? `+${m.bet_amount * 2}` : `-${m.bet_amount}`} {m.is_free_match ? "mol" : "MC"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-white/10 bg-zinc-950/30 p-8 text-center">
            <TrendingUp className="mx-auto mb-2 size-6 text-zinc-700" />
            <p className="text-sm text-zinc-500 uppercase tracking-widest">No completed battles yet.</p>
            <Link
              href="/arena"
              className="mt-3 inline-block text-xs font-black text-fuchsia-400 hover:text-fuchsia-300 uppercase tracking-widest"
            >
              Hit the arena →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border border-white/10 bg-black/50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
      <p className={`text-lg font-black tabular-nums ${accent}`} style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </p>
    </div>
  );
}
