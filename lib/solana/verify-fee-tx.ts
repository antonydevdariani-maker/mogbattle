import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { FEE_RECIPIENT_WALLET, USDC_MINT_MAINNET, feeFromGrossUsdc } from "@/lib/wallet/usdc-deposit";

function getSolanaConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  return new Connection(url, "confirmed");
}

/**
 * Confirms a succeeded tx and that the fee recipient's USDC token balance (by owner) increased by ~expected fee.
 */
export async function verifyUsdcPlatformFeeTransaction(params: {
  signature: string;
  grossUsdc: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { signature, grossUsdc } = params;
  const expectedFee = feeFromGrossUsdc(grossUsdc);
  if (expectedFee <= BigInt(0)) {
    return { ok: false, reason: "Invalid amount." };
  }

  const connection = getSolanaConnection();
  const parsed = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!parsed) {
    return { ok: false, reason: "Transaction not found on-chain." };
  }
  if (parsed.meta?.err) {
    return { ok: false, reason: "Transaction failed on-chain." };
  }

  const feeOwnerPk = new PublicKey(FEE_RECIPIENT_WALLET);
  const mintPk = new PublicKey(USDC_MINT_MAINNET);
  const expectedFeeAta = getAssociatedTokenAddressSync(mintPk, feeOwnerPk, false, TOKEN_PROGRAM_ID).toBase58();

  const preList = parsed.meta?.preTokenBalances ?? [];
  const postList = parsed.meta?.postTokenBalances ?? [];

  const accountKeys: string[] = parsed.transaction.message.accountKeys.map((a) => a.pubkey.toBase58());

  const matchesEntry = (b: { mint: string; accountIndex: number; owner?: string }) => {
    if (b.mint !== USDC_MINT_MAINNET) return false;
    if (b.owner === FEE_RECIPIENT_WALLET) return true;
    const acct = accountKeys[b.accountIndex];
    return acct === expectedFeeAta;
  };

  const pre = preList.find(matchesEntry);
  const post = postList.find(matchesEntry);
  if (!post) {
    return { ok: false, reason: "Fee USDC account change not found in this transaction." };
  }

  const preAmt = pre ? BigInt(pre.uiTokenAmount.amount) : BigInt(0);
  const postAmt = BigInt(post.uiTokenAmount.amount);
  const diff = postAmt - preAmt;
  if (diff <= BigInt(0)) {
    return { ok: false, reason: "Fee wallet did not receive USDC in this transaction." };
  }

  const tolerance = BigInt(2); /* micro USDC */
  if (diff + tolerance < expectedFee || diff > expectedFee + tolerance) {
    return {
      ok: false,
      reason: "USDC fee amount does not match expected 20% of your claim.",
    };
  }

  return { ok: true };
}
