import { PublicKey, TransactionMessage, VersionedTransaction, Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { FEE_RECIPIENT_WALLET, USDC_MINT_MAINNET, USDC_DECIMALS } from "@/lib/wallet/usdc-deposit";

/** $5.00 USDC in raw units */
export const FACE_REPORT_PRICE_RAW = BigInt(5_000_000);

/** Build an unsigned VersionedTransaction sending exactly $5 USDC to the treasury. */
export async function buildFacePaymentTxBytes(params: {
  owner: PublicKey;
  connection: Connection;
}): Promise<Uint8Array> {
  const { owner, connection } = params;
  const mint = new PublicKey(USDC_MINT_MAINNET);
  const treasury = new PublicKey(FEE_RECIPIENT_WALLET);

  const source = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  const dest = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_PROGRAM_ID);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(owner, dest, treasury, mint, TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(source, mint, dest, owner, FACE_REPORT_PRICE_RAW, USDC_DECIMALS, [], TOKEN_PROGRAM_ID),
  ];

  const msg = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return new VersionedTransaction(msg).serialize();
}
