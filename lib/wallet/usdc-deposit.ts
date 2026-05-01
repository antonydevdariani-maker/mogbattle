/** Mainnet USDC (SPL) — Solana */
export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Platform fee receiver (USDC) */
export const FEE_RECIPIENT_WALLET = "HkgnvzxMEwiW5egVFS8dgMrSr7PX99Ak6sPE15BbTkcL";

/** 20% platform fee on deposit claims */
export const PLATFORM_FEE_FRACTION = 0.2;

/** 80% credited as Mog Credits (1:1 with USDC for the net portion) */
export const USER_CREDIT_FRACTION = 0.8;

export const USDC_DECIMALS = 6;

export function usdcToRaw(amount: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) return BigInt(0);
  return BigInt(Math.floor(amount * 10 ** USDC_DECIMALS + 1e-9));
}

/** Whole Mog Credits → USDC raw units (1 MC = $1 USDC). */
export function mcToUsdcRaw(amountMc: number): bigint {
  if (!Number.isFinite(amountMc) || amountMc < 0 || !Number.isInteger(amountMc)) return BigInt(0);
  return BigInt(amountMc) * BigInt(10 ** USDC_DECIMALS);
}

export function feeFromGrossUsdc(gross: number): bigint {
  return usdcToRaw(gross * PLATFORM_FEE_FRACTION);
}

/** Integer Mog Credits = floor(gross × 80%) */
export function mogCreditsFromGrossUsdc(gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return Math.max(0, Math.floor(gross * USER_CREDIT_FRACTION));
}
