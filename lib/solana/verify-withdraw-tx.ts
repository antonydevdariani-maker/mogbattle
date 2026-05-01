import { Connection, PublicKey } from "@solana/web3.js";
import { USDC_MINT_MAINNET, mcToUsdcRaw } from "@/lib/wallet/usdc-deposit";

function getSolanaConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  return new Connection(url, "confirmed");
}

/**
 * Confirms a succeeded tx: recipient's USDC balance increased by ~amountMc USDC from owner's transfer.
 */
export async function verifyUsdcWithdrawTransaction(params: {
  signature: string;
  ownerAddress: string;
  recipientAddress: string;
  amountMc: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { signature, ownerAddress, recipientAddress, amountMc } = params;
  if (!Number.isFinite(amountMc) || amountMc < 1 || !Number.isInteger(amountMc)) {
    return { ok: false, reason: "Invalid amount." };
  }

  let ownerPk: PublicKey;
  let recipientPk: PublicKey;
  try {
    ownerPk = new PublicKey(ownerAddress);
    recipientPk = new PublicKey(recipientAddress);
  } catch {
    return { ok: false, reason: "Invalid wallet address." };
  }

  if (ownerPk.equals(recipientPk)) {
    return { ok: false, reason: "Invalid transfer." };
  }

  const expectedRaw = mcToUsdcRaw(amountMc);
  const tolerance = BigInt(2);

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

  const recipientOwner = recipientPk.toBase58();
  const preList = parsed.meta?.preTokenBalances ?? [];
  const postList = parsed.meta?.postTokenBalances ?? [];

  const matchesRecipient = (b: { mint: string; owner?: string }) =>
    b.mint === USDC_MINT_MAINNET && b.owner === recipientOwner;

  const pre = preList.find(matchesRecipient);
  const post = postList.find(matchesRecipient);
  if (!post) {
    return { ok: false, reason: "Recipient USDC balance change not found in this transaction." };
  }

  const preAmt = pre ? BigInt(pre.uiTokenAmount.amount) : BigInt(0);
  const postAmt = BigInt(post.uiTokenAmount.amount);
  const diff = postAmt - preAmt;
  if (diff + tolerance < expectedRaw || diff > expectedRaw + tolerance) {
    return {
      ok: false,
      reason: "USDC received does not match the Mog Credits amount for this withdrawal.",
    };
  }

  const ownerOwner = ownerPk.toBase58();
  const matchesOwner = (b: { mint: string; owner?: string }) =>
    b.mint === USDC_MINT_MAINNET && b.owner === ownerOwner;

  const preO = preList.find(matchesOwner);
  const postO = postList.find(matchesOwner);
  if (!postO) {
    return { ok: false, reason: "Sender USDC account not found in this transaction." };
  }
  const preOAmt = preO ? BigInt(preO.uiTokenAmount.amount) : BigInt(0);
  const postOAmt = BigInt(postO.uiTokenAmount.amount);
  const outDiff = preOAmt - postOAmt;
  if (outDiff + tolerance < expectedRaw) {
    return { ok: false, reason: "Embedded wallet did not send the expected USDC amount." };
  }

  return { ok: true };
}
