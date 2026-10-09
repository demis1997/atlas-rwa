import Fastify from "fastify";
import { isAddress } from "ethers";
import { openDatabase, migrate } from "./database.js";
import { synchronize, ledgerBalances } from "../../../indexer/src/indexer.js";
import { loadManifest, connect } from "../../../packages/sdk/src/chain.js";
const app = Fastify({ logger: true });
const db = await openDatabase(process.env.DATABASE_URL);
await migrate(db);
const manifest = await loadManifest();
const { provider, contracts, source } = await connect(manifest);
for (const investor of manifest.investors)
  await db.query(
    "INSERT INTO investors(wallet,label,reference) VALUES($1,$2,$3) ON CONFLICT(wallet) DO NOTHING",
    [investor.wallet.toLowerCase(), investor.label, "synthetic-local-demo"],
  );
let tail: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work, work);
  tail = next.catch(() => {});
  return next;
}
const serializable = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
const security = contracts.SecurityToken!;
const registry = contracts.IdentityRegistry!;
const offering = contracts.BondOffering!;
const actions = contracts.CorporateActions!;
const dvp = contracts.DvP!;
app.get("/health", async () => ({
  ok: true,
  chainId: manifest.chainId,
  database: process.env.DATABASE_URL
    ? "PostgreSQL server"
    : "Embedded PostgreSQL (PGlite)",
}));
app.get("/api/snapshot", async () =>
  exclusive(async () => {
    const index = await synchronize(db, source, String(manifest.chainId), 2);
    const tag = { blockTag: index.indexed };
    const ledger = await ledgerBalances(
      db,
      String(manifest.chainId),
      String(security.target),
    );
    const tracked = await db.query<{ hash: string; status: string }>(
      "SELECT hash,status FROM transactions WHERE chain_id=$1",
      [String(manifest.chainId)],
    );
    for (const row of tracked.rows.filter(
      (r) => r.status === "submitted" || r.status === "pending",
    )) {
      const receipt = await provider.getTransactionReceipt(row.hash);
      if (receipt && receipt.status === 0)
        await db.query(
          "UPDATE transactions SET status='reverted',block_number=$3,block_hash=$4 WHERE chain_id=$1 AND hash=$2",
          [
            String(manifest.chainId),
            row.hash,
            receipt.blockNumber,
            receipt.blockHash,
          ],
        );
      else if (!receipt && row.status === "submitted")
        await db.query(
          "UPDATE transactions SET status='pending' WHERE chain_id=$1 AND hash=$2",
          [String(manifest.chainId), row.hash],
        );
    }
    const identities = await db.query<{ args: Record<string, unknown> }>(
      "SELECT args FROM events WHERE chain_id=$1 AND address=$2 AND name IN ('IdentityRegistered','WalletRotated') ORDER BY block_number,log_index",
      [String(manifest.chainId), String(registry.target).toLowerCase()],
    );
    const knownInvestors = new Map(
      manifest.investors.map((i) => [i.wallet.toLowerCase(), i]),
    );
    for (const event of identities.rows) {
      const wallet = event.args.wallet ?? event.args.replacement;
      if (
        typeof wallet === "string" &&
        isAddress(wallet) &&
        !knownInvestors.has(wallet.toLowerCase())
      ) {
        knownInvestors.set(wallet.toLowerCase(), {
          wallet,
          label: "Synthetic registered investor",
        });
      }
    }
    const investorDefinitions = [...knownInvestors.values()];
    const investors = await Promise.all(
      investorDefinitions.map(async (investor) => ({
        ...investor,
        verified: await registry.isVerified(investor.wallet, tag),
        country: String(await registry.countryOf(investor.wallet, tag)),
        balance: String(await security.balanceOf(investor.wallet, tag)),
        claimExpiry: String(
          (
            await registry.claims(
              await registry.subjectOf(investor.wallet, tag),
              1,
              tag,
            )
          ).expiresAt,
        ),
        eligible: await security.canTransfer(
          "0x0000000000000000000000000000000000000000",
          investor.wallet,
          1,
          tag,
        ),
        frozen: await security.frozen(investor.wallet, tag),
        subject: await registry.subjectOf(investor.wallet, tag),
      })),
    );
    const mismatches = [];
    for (const [wallet, amount] of ledger) {
      const actual = await security.balanceOf(wallet, tag);
      if (actual !== amount)
        mismatches.push({
          wallet,
          eventBalance: amount.toString(),
          chainBalance: String(actual),
        });
    }
    const supply = await security.totalSupply(tag);
    const ledgerSupply = [...ledger.values()].reduce((a, b) => a + b, 0n);
    if (supply !== ledgerSupply)
      mismatches.push({
        wallet: "TOTAL",
        eventBalance: String(ledgerSupply),
        chainBalance: String(supply),
      });
    const settlements = [];
    for (let id = 1n; id < (await dvp.nextId(tag)); id++) {
      if (id > 200n) break;
      const i = await dvp.instructions(id, tag);
      settlements.push({
        id: String(id),
        seller: i.seller,
        buyer: i.buyer,
        quantity: String(i.quantity),
        consideration: String(i.consideration),
        expiry: String(i.expiry),
        status: Number(i.status),
      });
    }
    const distributions = [];
    for (let id = 1n; id < (await actions.nextId(tag)); id++) {
      if (id > 200n) break;
      const d = await actions.distributions(id, tag);
      distributions.push({
        id: String(id),
        recordBlock: String(d.recordBlock),
        perToken: String(d.perToken),
        funded: String(d.funded),
        claimed: String(d.claimed),
      });
    }
    const events = await db.query(
      "SELECT * FROM events ORDER BY block_number DESC,log_index DESC LIMIT 100",
    );
    const transactions = await db.query(
      "SELECT * FROM transactions ORDER BY block_number DESC NULLS FIRST LIMIT 100",
    );
    const subscriptions = await Promise.all(
      investorDefinitions.map(async (i) => {
        const s = await offering.subscriptions(i.wallet, tag);
        return {
          wallet: i.wallet,
          requested: String(s.requested),
          allocated: String(s.allocated),
          status: Number(s.status),
          refund: String(await offering.refunds(i.wallet, tag)),
        };
      }),
    );
    return serializable({
      source: {
        chainId: manifest.chainId,
        ...index,
        database: process.env.DATABASE_URL
          ? "PostgreSQL server"
          : "Embedded PostgreSQL",
        contracts: manifest.contracts,
      },
      asset: {
        name: await security.name(tag),
        symbol: await security.symbol(tag),
        issuer: "Atlas Capital Markets Ltd. (fictional)",
        nominalPerToken: "1000",
        authorizedSupply: String(await security.authorizedSupply(tag)),
        supply: String(supply),
        lifetimeIssued: String(await security.lifetimeIssued(tag)),
        state: Number(await offering.state(tag)),
        paused: await security.paused(tag),
        maturity: String(await offering.maturity(tag)),
        documentURI: await security.documentURI(tag),
      },
      investors,
      subscriptions,
      settlements,
      distributions,
      obligations: {
        distribution: String(await actions.distributionLiability(tag)),
        redemptionReserve: String(await actions.redemptionReserve(tag)),
        escrow: String(await offering.escrowLiability(tag)),
      },
      reconciliation: {
        ok: mismatches.length === 0,
        ledgerSupply: String(ledgerSupply),
        mismatches,
      },
      events: events.rows,
      transactions: transactions.rows,
    });
  }),
);
const allowed: Record<string, string[]> = {
  IdentityRegistry: [
    "register",
    "attest",
    "revoke",
    "rotate",
    "setTrustedIssuer",
    "setRequiredTopics",
  ],
  Compliance: ["setRules"],
  SecurityToken: [
    "approve",
    "transfer",
    "setFreeze",
    "setPaused",
    "recover",
    "setDocument",
  ],
  BondOffering: [
    "approveOffering",
    "open",
    "close",
    "subscribe",
    "allocate",
    "settle",
    "cancelSubscription",
    "claimRefund",
    "rejectAllocation",
    "abort",
    "reclaimUnsettled",
    "finalize",
    "activate",
    "mature",
    "markRedeemed",
  ],
  DvP: ["propose", "accept", "cancel", "execute"],
  CorporateActions: ["createDistribution", "claim", "fundRedemption", "redeem"],
  MockEUR: ["approve"],
  AssetFactory: ["create"],
};
app.post<{
  Body: { contract: string; method: string; args: unknown[]; from: string };
}>(
  "/api/prepare",
  {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["contract", "method", "args", "from"],
        properties: {
          contract: { type: "string" },
          method: { type: "string" },
          args: { type: "array", maxItems: 16 },
          from: { type: "string" },
        },
      },
    },
  },
  async (req, reply) => {
    const { contract, method, args, from } = req.body;
    if (!isAddress(from) || !allowed[contract]?.includes(method))
      return reply.code(400).send({ error: "Unsupported command or sender" });
    try {
      const target = contracts[contract]!;
      const transaction = {
        to: String(target.target),
        from,
        data: target.interface.encodeFunctionData(method, args),
        value: "0x0",
        chainId: "0x7a69",
      };
      await provider.call(transaction);
      await exclusive(() =>
        db.query("INSERT INTO audit(action,payload) VALUES($1,$2)", [
          "prepare",
          JSON.stringify({ contract, method, from }),
        ]),
      );
      return { transaction };
    } catch (error) {
      return reply.code(422).send({
        error: error instanceof Error ? error.message : "Simulation failed",
      });
    }
  },
);
app.post<{ Body: { hash: string } }>(
  "/api/transactions",
  {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["hash"],
        properties: {
          hash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
        },
      },
    },
  },
  async (req, reply) => {
    const transaction = await provider.getTransaction(req.body.hash);
    if (
      !transaction?.to ||
      !Object.values(manifest.contracts).some(
        (a) => a.toLowerCase() === transaction.to?.toLowerCase(),
      )
    )
      return reply.code(400).send({ error: "Unknown local transaction" });
    await exclusive(() =>
      db.query(
        "INSERT INTO transactions(chain_id,hash,status) VALUES($1,$2,'submitted') ON CONFLICT DO NOTHING",
        [String(manifest.chainId), req.body.hash],
      ),
    );
    return { tracked: true };
  },
);
app.get("/api/audit", async () =>
  exclusive(async () => ({
    rows: (await db.query("SELECT * FROM audit ORDER BY id DESC LIMIT 100"))
      .rows,
  })),
);
app.addHook("onClose", async () => {
  await db.close();
  await provider.destroy();
});
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 3001) });
