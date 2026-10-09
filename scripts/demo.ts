import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
  ZeroAddress,
  type JsonRpcSigner,
} from "ethers";
import { writeFile } from "node:fs/promises";
import {
  artifact,
  loadManifest,
  type Manifest,
} from "../packages/sdk/src/chain.js";
const provider = new JsonRpcProvider(
  process.env.RPC_URL ?? "http://127.0.0.1:8545",
);
provider.pollingInterval = 20;
if ((await provider.getNetwork()).chainId !== 31337n)
  throw new Error("Only local Anvil chain 31337 supported");
const accounts = await provider.listAccounts();
const [admin, issuer, officer, agent, attester, alice, bob, charlie] =
  accounts as [
    JsonRpcSigner,
    JsonRpcSigner,
    JsonRpcSigner,
    JsonRpcSigner,
    JsonRpcSigner,
    JsonRpcSigner,
    JsonRpcSigner,
    JsonRpcSigner,
  ];
const addr = async (s: JsonRpcSigner) => s.getAddress();
const hash = (s: string) => keccak256(toUtf8Bytes(s));
const tx = async (p: Promise<any>) => {
  const t = await p;
  const receipt = await t.wait();
  if (receipt?.status !== 1) throw new Error("Transaction failed");
  return receipt;
};
async function deploy(
  name: string,
  args: unknown[],
  signer = admin,
): Promise<Contract> {
  const a = await artifact(name);
  const c = await new ContractFactory(a.abi, a.bytecode.object, signer).deploy(
    ...args,
  );
  await c.waitForDeployment();
  return c as unknown as Contract;
}
function as(c: Contract, s: JsonRpcSigner): Contract {
  return c.connect(s) as Contract;
}
const report: {
  step: string;
  transaction?: string;
  expectedRejection?: boolean;
}[] = [];
const step = async (name: string, p: Promise<any>) => {
  const receipt = await tx(p);
  report.push({ step: name, transaction: receipt.hash });
};
async function reject(name: string, fn: () => Promise<unknown>) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error(`${name} unexpectedly succeeded`);
  report.push({ step: name, expectedRejection: true });
}
if (process.argv.includes("--redeem")) {
  const manifest = await loadManifest();
  const security = new Contract(
    manifest.contracts.SecurityToken!,
    (await artifact("SecurityToken")).abi,
    admin,
  );
  const offering = new Contract(
    manifest.contracts.BondOffering!,
    (await artifact("BondOffering")).abi,
    admin,
  );
  const actions = new Contract(
    manifest.contracts.CorporateActions!,
    (await artifact("CorporateActions")).abi,
    admin,
  );
  await provider.send("evm_setNextBlockTimestamp", [1924905600]);
  await provider.send("evm_mine", []);
  await step("Mature bond at simulated 2030-12-31", offering.mature());
  for (const investor of [alice, bob]) {
    const quantity = await security.balanceOf(await addr(investor));
    await tx(as(security, investor).approve(actions.target, quantity));
    await step(
      "Redeem principal and burn securities",
      as(actions, investor).redeem(quantity),
    );
  }
  await step("Mark redeemed", offering.markRedeemed());
  await provider.send("anvil_mine", [3]);
  if (
    (await security.totalSupply()) !== 0n ||
    (await actions.redemptionReserve()) !== 0n
  )
    throw new Error("Redemption reconciliation failed");
  await writeFile(
    "examples/corporate-bond/redemption-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Principal redeemed; supply and reserve are zero.");
} else {
  const registry = await deploy("IdentityRegistry", [
    await addr(admin),
    await addr(officer),
  ]);
  const policy = await deploy("Compliance", [
    await addr(admin),
    await addr(officer),
  ]);
  // Multiple named contracts share Compliance.sol artifacts.
  const module = async (name: string, args: unknown[]) => {
    const { readFile } = await import("node:fs/promises");
    const a = JSON.parse(
      await readFile(`contracts/out/Compliance.sol/${name}.json`, "utf8"),
    );
    const c = await new ContractFactory(a.abi, a.bytecode.object, admin).deploy(
      ...args,
    );
    await c.waitForDeployment();
    return c;
  };
  const jurisdiction = await module("JurisdictionRule", [
    registry.target,
    [276],
  ]);
  const holdings = await module("HoldingLimitRule", [6000]);
  const concentration = await module("ConcentrationRule", [10000, 6000]);
  const lockup = await module("LockupRule", [0]);
  await tx(
    as(policy, officer).setRules([
      jurisdiction.target,
      holdings.target,
      concentration.target,
      lockup.target,
    ]),
  );
  const factory = await deploy("AssetFactory", [
    await addr(admin),
    await addr(issuer),
  ]);
  const id = hash("ATLAS-2030");
  await step(
    "Create bond via factory",
    as(factory, issuer).create(
      id,
      "ATLAS-2030 Corporate Bond",
      "ATLAS30",
      10000,
      registry.target,
      policy.target,
      [
        await addr(admin),
        await addr(issuer),
        await addr(officer),
        await addr(agent),
      ],
    ),
  );
  const security = new Contract(
    await factory.assets(id),
    (await artifact("SecurityToken")).abi,
    admin,
  );
  const eur = await deploy("MockEUR", []);
  const offering = await deploy("BondOffering", [
    security.target,
    eur.target,
    await addr(admin),
    await addr(issuer),
    await addr(officer),
    await addr(issuer),
    1000_000000n,
    1924905600,
  ]);
  const dvp = await deploy("DvP", [security.target, eur.target]);
  const actions = await deploy("CorporateActions", [
    offering.target,
    await addr(admin),
    await addr(agent),
  ]);
  await tx(
    as(security, issuer).setDocument(
      "urn:atlas:synthetic:ATLAS-2030",
      hash("Fictional bond terms"),
    ),
  );
  await tx(security.grantRole(await security.ISSUER_ROLE(), offering.target));
  await tx(
    security.revokeRole(await security.ISSUER_ROLE(), await addr(issuer)),
  );
  await tx(security.grantRole(await security.REDEEMER_ROLE(), actions.target));
  await tx(
    as(registry, officer).setTrustedIssuer(await addr(attester), 1, true),
  );
  for (const [investor, country] of [
    [alice, 276],
    [bob, 276],
    [charlie, 840],
  ] as const) {
    const wallet = await addr(investor);
    const subject = hash(wallet);
    await tx(as(registry, officer).register(wallet, subject, country));
    await step(
      "Attest synthetic investor",
      as(registry, attester).attest(
        subject,
        1,
        1956528000,
        hash("synthetic evidence"),
      ),
    );
  }
  await step("Approve offering", as(offering, officer).approveOffering());
  await step("Open subscriptions", as(offering, issuer).open());
  for (const investor of [alice, bob]) {
    await tx(eur.faucet(await addr(investor), 5000000_000000n));
    await tx(as(eur, investor).approve(offering.target, 5000000_000000n));
    await step("Subscribe 5000 bonds", as(offering, investor).subscribe(5000));
  }
  await reject("Reject restricted jurisdiction", () =>
    as(offering, charlie).subscribe.staticCall(1),
  );
  await tx(as(offering, issuer).close());
  for (const investor of [alice, bob]) {
    await tx(as(offering, issuer).allocate(await addr(investor), 5000));
    await step(
      "Settle primary allocation",
      offering.settle(await addr(investor)),
    );
  }
  await tx(as(offering, issuer).finalize());
  await tx(as(offering, issuer).activate());
  await step(
    "Secondary transfer",
    as(security, alice).transfer(await addr(bob), 100),
  );
  await reject("Reject restricted transfer", () =>
    as(security, alice).transfer.staticCall(awaitAddress(charlie), 1),
  );
  await tx(eur.faucet(await addr(alice), 200000_000000n));
  await tx(as(security, bob).approve(dvp.target, 200));
  const now = (await provider.getBlock("latest"))!.timestamp;
  await tx(
    as(dvp, bob).propose(await addr(alice), 200, 200000_000000n, now + 86400),
  );
  await tx(as(dvp, alice).accept(1));
  await reject("Atomic rollback without cash approval", () =>
    dvp.execute.staticCall(1),
  );
  await tx(as(eur, alice).approve(dvp.target, 200000_000000n));
  await step("Atomic DvP settlement", dvp.execute(1));
  await tx(eur.faucet(await addr(agent), 10500000_000000n));
  await tx(as(eur, agent).approve(actions.target, 10500000_000000n));
  await step(
    "Record and fund annual 5% coupon",
    as(actions, agent).createDistribution(50_000000n),
  );
  for (const investor of [alice, bob])
    await step("Claim historical coupon", as(actions, investor).claim(1));
  await reject("Reject duplicate coupon claim", () =>
    as(actions, alice).claim.staticCall(1),
  );
  await step(
    "Prefund principal redemption",
    as(actions, agent).fundRedemption(10000000_000000n),
  );
  await provider.send("anvil_mine", [3]);
  const manifest: Manifest = {
    chainId: 31337,
    deployedAt: 0,
    contracts: {
      IdentityRegistry: String(registry.target),
      Compliance: String(policy.target),
      AssetFactory: String(factory.target),
      SecurityToken: String(security.target),
      MockEUR: String(eur.target),
      BondOffering: String(offering.target),
      DvP: String(dvp.target),
      CorporateActions: String(actions.target),
    },
    investors: await Promise.all(
      [
        [alice, "Northstar Pension (synthetic)"],
        [bob, "Harbor Credit Fund (synthetic)"],
        [charlie, "Restricted Investor (synthetic)"],
      ].map(async ([signer, label]) => ({
        wallet: await (signer as JsonRpcSigner).getAddress(),
        label: String(label),
      })),
    ),
  };
  await writeFile(
    "examples/corporate-bond/deployment.json",
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    "examples/corporate-bond/lifecycle-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Active €10m bond deployed; coupon paid; principal fully reserved.",
  );
}
function awaitAddress(s: JsonRpcSigner) {
  return s.getAddress();
}
await provider.destroy();
