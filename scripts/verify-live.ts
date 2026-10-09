import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3001";
const checks: string[] = [];
const snapshot = await (await fetch(`${base}/api/snapshot`)).json();
assert.equal(snapshot.reconciliation.ok, true);
assert.equal(snapshot.asset.supply, "0");
assert.equal(snapshot.asset.state, 7);
for (const amount of Object.values(snapshot.obligations))
  assert.equal(amount, "0");
checks.push("Redeemed lifecycle and canonical reconciliation");
const post = (url: string, body: unknown) =>
  fetch(`${base}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const from = snapshot.investors[0].wallet;
const result = await post("/api/prepare", {
  contract: "SecurityToken",
  method: "approve",
  from,
  args: [snapshot.source.contracts.DvP, "1"],
});
assert.equal(result.status, 200);
const prepared = await result.json();
assert.equal(prepared.transaction.to, snapshot.source.contracts.SecurityToken);
assert.equal(prepared.transaction.chainId, "0x7a69");
assert.ok(prepared.transaction.data.startsWith("0x095ea7b3"));
checks.push("Unsigned approval simulated with exact token target and chain");
assert.equal(
  (
    await post("/api/prepare", {
      contract: "SecurityToken",
      method: "mint",
      from,
      args: [from, "1"],
    })
  ).status,
  400,
);
assert.equal(
  (
    await post("/api/prepare", {
      contract: "IdentityRegistry",
      method: "register",
      from,
      args: [from, "0x" + "11".repeat(32), "276"],
    })
  ).status,
  422,
);
checks.push("Disallowed method and unauthorized registry mutation rejected");
const second = await (await fetch(`${base}/api/snapshot`)).json();
assert.equal(second.events.length, snapshot.events.length);
assert.equal(second.reconciliation.ok, true);
const audit = await (await fetch(`${base}/api/audit`)).json();
assert.ok(audit.rows.length > 0);
checks.push("Repeated indexing idempotent; preparation audit persisted");
await writeFile(
  "docs/live-api-verification.json",
  JSON.stringify(
    { date: "2026-10-09", checks, passed: checks.length },
    null,
    2,
  ),
);
console.log(`${checks.length} live API checks passed`);
