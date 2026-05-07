"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ShoppingBag,
  Package,
  Zap,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import {
  SHOP_TAGS,
  CHEST_PRICE,
  RARITY_LABEL,
  RARITY_BORDER,
  type ShopTag,
} from "@/lib/shop-tags";
import {
  loadShopData,
  buyTag,
  openChest,
  setActiveTag,
} from "@/app/actions";

const CARD_WIDTH = 96;
const WINNER_INDEX = 38;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildStrip(winnerTag: ShopTag): ShopTag[] {
  // Build ~50 item strip with winner at index 38
  const pool: ShopTag[] = [];
  for (let i = 0; i < 7; i++) {
    pool.push(...shuffle(SHOP_TAGS));
  }
  // Trim to 50
  const strip = pool.slice(0, 50);
  strip[WINNER_INDEX] = winnerTag;
  return strip;
}

function TagBadge({ tag, size = "md" }: { tag: ShopTag; size?: "sm" | "md" | "lg" }) {
  const sizeClass =
    size === "sm"
      ? "text-xs px-2 py-0.5"
      : size === "lg"
      ? "text-base px-4 py-1.5"
      : "text-sm px-3 py-1";
  return (
    <span
      className={`font-black uppercase tracking-widest border ${sizeClass}`}
      style={{
        color: tag.color,
        borderColor: tag.color + "60",
        background: tag.color + "15",
        fontFamily: "var(--font-heading)",
      }}
    >
      {tag.label}
    </span>
  );
}

function RarityBadge({ rarity }: { rarity: ShopTag["rarity"] }) {
  const colors: Record<ShopTag["rarity"], string> = {
    legendary: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
    rare: "text-purple-400 border-purple-500/40 bg-purple-500/10",
    uncommon: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10",
    common: "text-zinc-400 border-zinc-600/40 bg-zinc-800/40",
  };
  return (
    <span
      className={`text-[10px] font-black uppercase tracking-widest border px-1.5 py-0.5 ${colors[rarity]}`}
      style={{ fontFamily: "var(--font-heading)" }}
    >
      {RARITY_LABEL[rarity]}
    </span>
  );
}

function StripCard({ tag }: { tag: ShopTag }) {
  return (
    <div
      className={`flex-shrink-0 border ${RARITY_BORDER[tag.rarity]} bg-zinc-900 flex flex-col items-center justify-center gap-1 p-2`}
      style={{ width: CARD_WIDTH, height: 100 }}
    >
      <span
        className="text-[11px] font-black uppercase tracking-widest text-center leading-tight"
        style={{ color: tag.color, fontFamily: "var(--font-heading)" }}
      >
        {tag.label}
      </span>
      <RarityBadge rarity={tag.rarity} />
    </div>
  );
}

export default function ShopPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"buy" | "chest">("buy");
  const [molecules, setMolecules] = useState(0);
  const [ownedTags, setOwnedTags] = useState<string[]>([]);
  const [activeTag, setActiveTagState] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [strip, setStrip] = useState<ShopTag[]>([]);
  const [translateX, setTranslateX] = useState(0);
  const [wonTag, setWonTag] = useState<ShopTag | null>(null);
  const [resultAlreadyOwned, setResultAlreadyOwned] = useState(false);
  const [resultRefund, setResultRefund] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [settingTag, setSettingTag] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    loadShopData(token).then((d) => {
      setMolecules(d.molecules);
      setOwnedTags(d.ownedTags);
      setActiveTagState(d.activeTag);
    });
  }, [token]);

  async function handleBuy(tagId: string) {
    if (!token) return;
    setBuyingId(tagId);
    try {
      await buyTag(token, tagId);
      const d = await loadShopData(token);
      setMolecules(d.molecules);
      setOwnedTags(d.ownedTags);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setBuyingId(null);
    }
  }

  async function handleOpenChest() {
    if (!token || spinning) return;
    setWonTag(null);
    setShowResult(false);
    setSpinning(true);

    let result: { tag: ShopTag; alreadyOwned: boolean; refund: number };
    try {
      result = await openChest(token);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error");
      setSpinning(false);
      return;
    }

    // Update mol locally immediately
    setMolecules((m) => m - CHEST_PRICE + result.refund);
    if (!result.alreadyOwned) {
      setOwnedTags((prev) => [...prev, result.tag.id]);
    }

    const newStrip = buildStrip(result.tag);
    setStrip(newStrip);
    // Reset to 0 instantly (no transition) then trigger animation
    setTranslateX(0);

    // Let React render the strip at position 0 first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const containerWidth = containerRef.current?.offsetWidth ?? 400;
        const finalX = -(WINNER_INDEX * CARD_WIDTH + CARD_WIDTH / 2 - containerWidth / 2);
        setTranslateX(finalX);
      });
    });

    setTimeout(() => {
      setWonTag(result.tag);
      setResultAlreadyOwned(result.alreadyOwned);
      setResultRefund(result.refund);
      setShowResult(true);
      setSpinning(false);
    }, 4200);
  }

  async function handleSetActive(tagId: string | null) {
    if (!token) return;
    setSettingTag(tagId ?? "__clear__");
    try {
      await setActiveTag(token, tagId);
      setActiveTagState(tagId);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setSettingTag(null);
    }
  }

  function resetChest() {
    setShowResult(false);
    setWonTag(null);
    setStrip([]);
    setTranslateX(0);
  }

  const activeTagData = activeTag ? SHOP_TAGS.find((t) => t.id === activeTag) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-6 text-yellow-400" />
          <h1
            className="text-2xl font-black uppercase tracking-widest text-white"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            TAG SHOP
          </h1>
        </div>
        <div className="flex items-center gap-2 border border-cyan-500/30 bg-cyan-500/5 px-4 py-2 w-fit">
          <Zap className="size-4 text-cyan-400" />
          <span
            className="text-lg font-black tabular-nums text-white"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {molecules.toLocaleString()}
          </span>
          <span className="text-xs text-zinc-500 font-bold uppercase">mol</span>
        </div>
      </div>

      {/* Active tag display */}
      {activeTagData && (
        <div className="flex items-center gap-3 border border-white/10 bg-zinc-900/50 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Active Tag:</span>
          <TagBadge tag={activeTagData} />
          <button
            className="ml-auto text-xs font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
            onClick={() => handleSetActive(null)}
            disabled={settingTag !== null}
          >
            Remove
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {(["buy", "chest"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
              tab === t
                ? "border-b-2 border-yellow-400 text-yellow-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {t === "buy" ? "Buy Tags" : "Open Chest"}
          </button>
        ))}
      </div>

      {/* BUY TAGS */}
      {tab === "buy" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHOP_TAGS.map((tag) => {
            const owned = ownedTags.includes(tag.id);
            const loading = buyingId === tag.id;
            return (
              <div
                key={tag.id}
                className={`border ${RARITY_BORDER[tag.rarity]} bg-zinc-900/60 p-4 flex flex-col gap-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <TagBadge tag={tag} size="lg" />
                  <RarityBadge rarity={tag.rarity} />
                </div>
                <div className="flex items-center gap-1.5 mt-auto">
                  <Zap className="size-3.5 text-cyan-400" />
                  <span
                    className="text-sm font-black text-white"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {tag.price.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-600 font-bold uppercase">mol</span>
                </div>
                <button
                  onClick={() => handleBuy(tag.id)}
                  disabled={owned || loading || molecules < tag.price}
                  className={`w-full py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                    owned
                      ? "border border-zinc-700 text-zinc-600 cursor-default"
                      : molecules < tag.price
                      ? "border border-zinc-700 text-zinc-700 cursor-not-allowed"
                      : "border border-yellow-500/60 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                  }`}
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {loading ? (
                    <RefreshCw className="size-3.5 animate-spin mx-auto" />
                  ) : owned ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <CheckCircle className="size-3.5" /> OWNED
                    </span>
                  ) : (
                    "BUY"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* OPEN CHEST */}
      {tab === "chest" && (
        <div className="space-y-6">
          <div className="border border-yellow-500/30 bg-zinc-900/60 p-6 flex flex-col items-center gap-4">
            <Package className="size-16 text-yellow-400" strokeWidth={1.5} />
            <div className="text-center">
              <h2
                className="text-xl font-black uppercase tracking-widest text-white"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Mystery Chest
              </h2>
              <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">
                Contains a random tag — higher rarity = harder to get
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-cyan-400" />
              <span
                className="text-lg font-black text-white"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {CHEST_PRICE}
              </span>
              <span className="text-xs text-zinc-500 font-bold uppercase">mol</span>
            </div>

            {/* Roulette strip */}
            {(spinning || showResult) && strip.length > 0 && (
              <div className="w-full relative mt-2">
                {/* Center marker */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-yellow-400 z-10 pointer-events-none" />

                {/* Strip container */}
                <div
                  ref={containerRef}
                  className="overflow-hidden border border-white/10 relative"
                  style={{ height: 108 }}
                >
                  <div
                    ref={stripRef}
                    className="flex gap-1 absolute left-0 top-1"
                    style={{
                      transform: `translateX(${translateX}px)`,
                      transition: spinning
                        ? "transform 4s cubic-bezier(0.15, 0.05, 0.05, 1.0)"
                        : "none",
                      willChange: "transform",
                    }}
                  >
                    {strip.map((tag, i) => (
                      <StripCard key={i} tag={tag} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Result overlay */}
            {showResult && wonTag && (
              <div className="w-full border border-white/10 bg-zinc-950 p-6 flex flex-col items-center gap-3">
                <span
                  className="text-xs font-black uppercase tracking-widest text-zinc-500"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {resultAlreadyOwned ? "DUPLICATE — TAG ALREADY OWNED" : "YOU GOT"}
                </span>
                <TagBadge tag={wonTag} size="lg" />
                <RarityBadge rarity={wonTag.rarity} />
                {resultAlreadyOwned && resultRefund > 0 && (
                  <div className="flex items-center gap-1.5 text-cyan-400">
                    <Zap className="size-3.5" />
                    <span
                      className="text-sm font-black"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      +{resultRefund} mol refund (10%)
                    </span>
                  </div>
                )}
                <button
                  onClick={resetChest}
                  disabled={molecules < CHEST_PRICE}
                  className="mt-2 border border-white/20 text-zinc-400 hover:text-white hover:border-white/40 px-6 py-2 text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  <RefreshCw className="size-3.5" />
                  Open Another
                </button>
              </div>
            )}

            {!showResult && (
              <button
                onClick={handleOpenChest}
                disabled={spinning || molecules < CHEST_PRICE}
                className={`px-8 py-3 text-sm font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${
                  spinning || molecules < CHEST_PRICE
                    ? "border border-zinc-700 text-zinc-600 cursor-not-allowed"
                    : "border border-yellow-500/60 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {spinning ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <Package className="size-4" />
                    Open Chest ({CHEST_PRICE} mol)
                  </>
                )}
              </button>
            )}
          </div>

          {/* Drop rates */}
          <div className="border border-white/5 bg-zinc-900/30 p-4">
            <p
              className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Drop Rates
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SHOP_TAGS.map((tag) => {
                const total = SHOP_TAGS.reduce((s, t) => s + t.chestWeight, 0);
                const pct = ((tag.chestWeight / total) * 100).toFixed(1);
                return (
                  <div key={tag.id} className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-black uppercase truncate"
                      style={{ color: tag.color, fontFamily: "var(--font-heading)" }}
                    >
                      {tag.label}
                    </span>
                    <span className="text-[11px] text-zinc-600 font-bold tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MY TAGS — always visible */}
      <div className="space-y-3">
        <p
          className="text-xs font-black uppercase tracking-widest text-zinc-500 border-b border-white/5 pb-2"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          My Tags ({ownedTags.length})
        </p>
        {ownedTags.length === 0 ? (
          <p className="text-xs text-zinc-700 uppercase tracking-widest">
            No tags yet — buy one above or open a chest.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ownedTags.map((id) => {
              const tag = SHOP_TAGS.find((t) => t.id === id);
              if (!tag) return null;
              const isActive = activeTag === id;
              const loading = settingTag === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSetActive(isActive ? null : id)}
                  disabled={loading}
                  className={`relative transition-all ${
                    isActive ? "ring-2 ring-yellow-400/60 ring-offset-1 ring-offset-black" : ""
                  }`}
                  title={isActive ? "Click to deactivate" : "Click to set active"}
                >
                  <TagBadge tag={tag} size="sm" />
                  {isActive && (
                    <CheckCircle className="absolute -top-1.5 -right-1.5 size-3.5 text-yellow-400 bg-black rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
