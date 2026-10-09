import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "../../apps/api/src/database.js";
import { synchronize, ledgerBalances, type ChainBlock } from "./indexer.js";
test("PostgreSQL event ingestion is idempotent and rolls back a same-height reorg", async () => {
  const db = await openDatabase();
  await migrate(db);
  const zero = "0x0000000000000000000000000000000000000000";
  let blocks: ChainBlock[] = [
    { number: 0, hash: "a", parentHash: "0", logs: [] },
    {
      number: 1,
      hash: "b",
      parentHash: "a",
      logs: [
        {
          transactionHash: "tx1",
          index: 0,
          address: "token",
          name: "Transfer",
          args: { from: zero, to: "alice", value: "100" },
        },
      ],
    },
    { number: 2, hash: "c", parentHash: "b", logs: [] },
  ];
  const source = {
    head: async () => blocks.length - 1,
    block: async (n: number) => blocks[n]!,
  };
  await synchronize(db, source, "31337", 1);
  await synchronize(db, source, "31337", 1);
  assert.equal((await ledgerBalances(db, "31337", "token")).get("alice"), 100n);
  assert.equal((await db.query("SELECT * FROM events")).rows.length, 1);
  assert.equal(
    (await db.query("SELECT status FROM transactions")).rows[0]?.status,
    "confirmed",
  );
  blocks = [
    blocks[0]!,
    {
      number: 1,
      hash: "b2",
      parentHash: "a",
      logs: [
        {
          transactionHash: "tx2",
          index: 0,
          address: "token",
          name: "Transfer",
          args: { from: zero, to: "bob", value: "50" },
        },
      ],
    },
    { number: 2, hash: "c2", parentHash: "b2", logs: [] },
  ];
  await synchronize(db, source, "31337", 1);
  const balances = await ledgerBalances(db, "31337", "token");
  assert.equal(balances.has("alice"), false);
  assert.equal(balances.get("bob"), 50n);
  assert.equal(
    (await db.query("SELECT status FROM transactions WHERE hash='tx1'")).rows[0]
      ?.status,
    "reorganized",
  );
  await db.close();
});
test("an inconsistent chain read rolls back the whole batch", async () => {
  const db = await openDatabase();
  await migrate(db);
  const source = {
    head: async () => 1,
    block: async (n: number) => ({
      number: n,
      hash: `${n}`,
      parentHash: "wrong",
      logs: [],
    }),
  };
  await assert.rejects(synchronize(db, source, "31337", 1));
  assert.equal((await db.query("SELECT * FROM blocks")).rows.length, 0);
  await db.close();
});
