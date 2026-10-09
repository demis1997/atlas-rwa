import type { Database } from "../../apps/api/src/database.js";
export type ChainLog = {
  transactionHash: string;
  index: number;
  address: string;
  name: string;
  args: Record<string, unknown>;
};
export type ChainBlock = {
  number: number;
  hash: string;
  parentHash: string;
  logs: ChainLog[];
};
export interface ChainSource {
  head(): Promise<number>;
  block(n: number): Promise<ChainBlock>;
}
export async function synchronize(
  db: Database,
  source: ChainSource,
  chainId: string,
  confirmations: number,
) {
  if (!Number.isSafeInteger(confirmations) || confirmations < 1)
    throw new Error("Invalid confirmation depth");
  const head = await source.head();
  const tip = await db.query<{ number: string }>(
    "SELECT number FROM blocks WHERE chain_id=$1 ORDER BY number DESC LIMIT 1",
    [chainId],
  );
  let cursor = tip.rows.length ? Number(tip.rows[0]!.number) : -1;
  // Walk backwards to the common ancestor, including same-height and shorter-chain replacements.
  while (cursor >= 0) {
    const saved = await db.query<{ hash: string }>(
      "SELECT hash FROM blocks WHERE chain_id=$1 AND number=$2",
      [chainId, cursor],
    );
    if (
      cursor <= head &&
      saved.rows[0]?.hash === (await source.block(cursor)).hash
    )
      break;
    cursor--;
  }
  await db.query("BEGIN");
  try {
    await db.query(
      "UPDATE transactions SET status='reorganized',block_number=NULL,block_hash=NULL WHERE chain_id=$1 AND block_number>$2",
      [chainId, cursor],
    );
    await db.query("DELETE FROM events WHERE chain_id=$1 AND block_number>$2", [
      chainId,
      cursor,
    ]);
    await db.query("DELETE FROM blocks WHERE chain_id=$1 AND number>$2", [
      chainId,
      cursor,
    ]);
    const stop = Math.min(head, cursor + 250);
    let previous = cursor >= 0 ? (await source.block(cursor)).hash : undefined;
    for (let number = cursor + 1; number <= stop; number++) {
      const block = await source.block(number);
      if (previous && block.parentHash !== previous)
        throw new Error("Chain changed while indexing; retry");
      await db.query("INSERT INTO blocks VALUES($1,$2,$3,$4)", [
        chainId,
        number,
        block.hash,
        block.parentHash,
      ]);
      for (const log of block.logs) {
        await db.query(
          "INSERT INTO events VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
          [
            chainId,
            number,
            block.hash,
            log.transactionHash,
            log.index,
            log.address.toLowerCase(),
            log.name,
            JSON.stringify(log.args),
          ],
        );
        await db.query(
          "INSERT INTO transactions VALUES($1,$2,'pending',$3,$4) ON CONFLICT(chain_id,hash) DO UPDATE SET status='pending',block_number=$3,block_hash=$4",
          [chainId, log.transactionHash, number, block.hash],
        );
      }
      previous = block.hash;
    }
    if (stop >= 0 && (await source.block(stop)).hash !== previous)
      throw new Error("Reorg during read");
    await db.query(
      "UPDATE transactions SET status='confirmed' WHERE chain_id=$1 AND status='pending' AND block_number<=$2",
      [chainId, head - confirmations],
    );
    await db.query("COMMIT");
    return { head, indexed: stop, confirmedThrough: head - confirmations };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
export async function ledgerBalances(
  db: Database,
  chainId: string,
  token: string,
) {
  const result = await db.query<{
    args: { from: string; to: string; value: string };
  }>(
    "SELECT args FROM events WHERE chain_id=$1 AND address=$2 AND name=$3 ORDER BY block_number,log_index",
    [chainId, token.toLowerCase(), "Transfer"],
  );
  const balances = new Map<string, bigint>();
  const zero = "0x0000000000000000000000000000000000000000";
  for (const { args } of result.rows) {
    for (const [wallet, delta] of [
      [args.from, -BigInt(args.value)],
      [args.to, BigInt(args.value)],
    ] as const) {
      if (wallet.toLowerCase() !== zero)
        balances.set(
          wallet.toLowerCase(),
          (balances.get(wallet.toLowerCase()) ?? 0n) + delta,
        );
    }
  }
  return balances;
}
