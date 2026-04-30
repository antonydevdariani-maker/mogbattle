import { PublicKey, TransactionMessage, VersionedTransaction, Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  FEE_RECIPIENT_WALLET,
  USDC_MINT_MAINNET,
  USDC_DECIMALS,
  feeFromGrossUsdc,
} from "@/lib/wallet/usdc-deposit";

const USDC = () => new PublicKey(USDC_MINT_MAINNET);
const FEE = () => new PublicKey(FEE_RECIPIENT_WALLET);

/**
 * Build unsigned VersionedTransaction bytes: user pays 20% of `grossUsdc` in USDC to the fee wallet.
 * User must have USDC in their mainnet USDC ATA.
 */
export async function buildUsdcFeeTransferTxBytes(params: {
  owner: PublicKey;
  grossUsdc: number;
  connection: Connection;
}): Promise<{ transactionBytes: Uint8Array; expectedFeeRaw: bigint }> {
  const { owner, grossUsdc, connection } = params;
  if (!Number.isFinite(grossUsdc) || grossUsdc <= 0) {
    throw new Error("Enter a valid USDC amount.");
  }

  const expectedFeeRaw = feeFromGrossUsdc(grossUsdc);
  if (expectedFeeRaw <= BigInt(0)) {
    throw new Error("Amount is too small after fee calculation.");
  }

  const mint = USDC();
  const feeOwner = FEE();
  const source = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  const dest = getAssociatedTokenAddressSync(mint, feeOwner, false, TOKEN_PROGRAM_ID);

  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const ixs = [
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      dest,
      feeOwner,
      mint,
      TOKEN_PROGRAM_ID
    ),
    createTransferCheckedInstruction(
      source,
      mint,
      dest,
      owner,
      expectedFeeRaw,
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
  return { transactionBytes: tx.serialize(), expectedFeeRaw };
}
