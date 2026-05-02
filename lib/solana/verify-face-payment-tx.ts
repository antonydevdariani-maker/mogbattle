import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { FEE_RECIPIENT_WALLET, USDC_MINT_MAINNET } from "@/lib/wallet/usdc-deposit";
import { FACE_REPORT_PRICE_RAW } from "./build-face-payment-tx";

function getConnection(): Connection {
  return new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
}

export async function verifyFacePaymentTransaction(
  signature: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const connection = getConnection();
  const parsed = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!parsed) return { ok: false, reason: "Transaction not found on-chain. Wait a moment and retry." };
  if (parsed.meta?.err) return { ok: false, reason: "Transaction failed on-chain." };

  const treasury = new PublicKey(FEE_RECIPIENT_WALLET);
  const mint = new PublicKey(USDC_MINT_MAINNET);
  const expectedAta = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_PROGRAM_ID).toBase58();
  const accountKeys: string[] = parsed.transaction.message.accountKeys.map((a) => a.pubkey.toBase58());

  const isMatch = (b: { mint: string; accountIndex: number; owner?: string }) => {
    if (b.mint !== USDC_MINT_MAINNET) return false;
    if (b.owner === FEE_RECIPIENT_WALLET) return true;
    return accountKeys[b.accountIndex] === expectedAta;
  };

  const pre = parsed.meta?.preTokenBalances?.find(isMatch);
  const post = parsed.meta?.postTokenBalances?.find(isMatch);
  if (!post) return { ok: false, reason: "No USDC transfer to treasury found in this transaction." };

  const diff = BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? "0");
  // Allow up to 1% slippage to handle any rounding
  if (diff < (FACE_REPORT_PRICE_RAW * BigInt(99)) / BigInt(100)) {
    return { ok: false, reason: `Payment too low — expected $5 USDC, got ${Number(diff) / 1e6} USDC.` };
  }

  return { ok: true };
}
