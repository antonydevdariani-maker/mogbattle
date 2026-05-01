import { PublicKey, TransactionMessage, VersionedTransaction, Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { USDC_MINT_MAINNET, USDC_DECIMALS, mcToUsdcRaw } from "@/lib/wallet/usdc-deposit";

const USDC = () => new PublicKey(USDC_MINT_MAINNET);

/**
 * Build unsigned VersionedTransaction: embedded wallet sends USDC to recipient's USDC ATA.
 * 1 Mog Credit = 1 USDC (integer dollars → 6 decimals).
 */
export async function buildUsdcWithdrawTransferTxBytes(params: {
  owner: PublicKey;
  recipient: PublicKey;
  amountMc: number;
  connection: Connection;
}): Promise<{ transactionBytes: Uint8Array }> {
  const { owner, recipient, amountMc, connection } = params;
  if (!Number.isFinite(amountMc) || amountMc < 1 || !Number.isInteger(amountMc)) {
    throw new Error("Enter a whole number of Mog Credits to withdraw (at least 1).");
  }

  if (recipient.equals(owner)) {
    throw new Error("Destination must be different from your embedded Mog wallet.");
  }

  const amountRaw = mcToUsdcRaw(amountMc);
  if (amountRaw <= BigInt(0)) {
    throw new Error("Amount is too small.");
  }

  const mint = USDC();
  const source = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  const destAta = getAssociatedTokenAddressSync(mint, recipient, false, TOKEN_PROGRAM_ID);

  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const ixs = [
    createAssociatedTokenAccountIdempotentInstruction(owner, destAta, recipient, mint, TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(
      source,
      mint,
      destAta,
      owner,
      amountRaw,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID
    ),
  ];

  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  return { transactionBytes: tx.serialize() };
}
