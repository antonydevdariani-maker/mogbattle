export type TagRarity = "legendary" | "rare" | "uncommon" | "common";

export type ShopTag = {
  id: string;
  label: string;
  price: number; // direct buy price in mol
  rarity: TagRarity;
  color: string; // hex color for the badge
  chestWeight: number; // relative probability in chest (higher = more common)
};

export const SHOP_TAGS: ShopTag[] = [
  { id: "og",      label: "OG",         price: 5000, rarity: "legendary", color: "#FFD700", chestWeight: 1 },
  { id: "alpha",   label: "ALPHA",      price: 2500, rarity: "rare",      color: "#a855f7", chestWeight: 3 },
  { id: "beast",   label: "BEAST MODE", price: 2000, rarity: "rare",      color: "#ef4444", chestWeight: 3 },
  { id: "sigma",   label: "SIGMA",      price: 1500, rarity: "uncommon",  color: "#06b6d4", chestWeight: 6 },
  { id: "cursed",  label: "CURSED",     price: 1000, rarity: "uncommon",  color: "#22c55e", chestWeight: 6 },
  { id: "mogger",  label: "MOGGER",     price: 800,  rarity: "common",    color: "#94a3b8", chestWeight: 12 },
  { id: "noob",    label: "NOOB",       price: 100,  rarity: "common",    color: "#6b7280", chestWeight: 15 },
  { id: "menace",  label: "MENACE",     price: 1200, rarity: "uncommon",  color: "#f97316", chestWeight: 8 },
  { id: "ghost",   label: "GHOST",      price: 900,  rarity: "common",    color: "#64748b", chestWeight: 10 },
];

export const CHEST_PRICE = 250; // mol

export const RARITY_LABEL: Record<TagRarity, string> = {
  legendary: "LEGENDARY",
  rare: "RARE",
  uncommon: "UNCOMMON",
  common: "COMMON",
};

export const RARITY_BORDER: Record<TagRarity, string> = {
  legendary: "border-yellow-400/60",
  rare:      "border-purple-500/60",
  uncommon:  "border-cyan-500/40",
  common:    "border-zinc-600/40",
};

/** Weighted random pick for chest opening */
export function pickChestTag(): ShopTag {
  const total = SHOP_TAGS.reduce((s, t) => s + t.chestWeight, 0);
  let r = Math.random() * total;
  for (const tag of SHOP_TAGS) {
    r -= tag.chestWeight;
    if (r <= 0) return tag;
  }
  return SHOP_TAGS[SHOP_TAGS.length - 1];
}
