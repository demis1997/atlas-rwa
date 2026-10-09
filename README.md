# ATLAS RWA

**A local reference for permissioned securities, atomic settlement and a complete fictional bond lifecycle.**

Atlas combines Solidity contracts, a PostgreSQL event ledger and a Next.js securities terminal. The demonstration issues **10,000 €1,000 bonds**, exchanges securities against mock EUR, pays a **€500,000 annual coupon**, advances the local chain to December 2030 and returns **€10 million principal** while retiring every token.

This is unaudited engineering software. It is not production-certified, regulator-approved or legally authorized to issue securities. All assets, investors and payment tokens are synthetic. No public deployment is required.

![Actual terminal connected to local Anvil](docs/screenshots/terminal-desktop.jpg)

_Actual running application, captured during the active phase. The completed demo is now redeemed; screenshots and transaction reports preserve both stages._

## What runs

- Permissioned ERC-20 with lifetime issuance cap, identity checks, address/partial freezing, recovery, document references and distinct administrative roles.
- Trusted synthetic claim issuers, mandatory topics, expiry, revocation, jurisdiction and one active wallet per subject.
- Composable jurisdiction, holding-limit, concentration and lockup policies.
- Deterministic authorized asset factory and explicit offering lifecycle.
- Primary subscription escrow, allocation, atomic issuance settlement and pull refunds, including expiry/cancellation exits.
- Buyer/seller-authorized same-chain DvP with cancellation, expiry and replay protection.
- Historical subject checkpoints, funded pull distributions and allowance-based principal redemption.
- PostgreSQL canonical event indexing, reorganization rollback, transaction states and balance reconciliation.
- A live terminal with eleven navigation views, investor registration/attestation preparation, operational commands, a token-deployment wizard and unsigned transaction simulation/download.

## Start locally

Prerequisites: Node **22.20+**, npm, Foundry and Solidity **0.8.30**. Foundry can obtain the pinned compiler. Local verification used an installed solc 0.8.30 via `--use /opt/homebrew/bin/solc`; that machine-specific path is not part of repository configuration.

```bash
npm ci --ignore-scripts
npm ci --prefix contracts --ignore-scripts
make check
make local
```

`make local` starts a fresh Anvil on loopback, deploys the demo, starts the embedded PostgreSQL API and serves the production terminal at **http://127.0.0.1:3000**. Ports 8545, 3001 and 3000 must be free. Its startup script owns its processes and stops them on exit. To repeat the whole scenario, stop that local session and start another; do not reuse an already-matured chain as a fresh issuance environment.

To complete maturity in a second terminal:

```bash
npm run demo:redeem
curl http://127.0.0.1:3001/api/snapshot
```

The redemption command explicitly simulates **2030-12-31 00:00 UTC** on Anvil. It does not wait for a real date. Final expected results: state `7` (Redeemed), supply `"0"`, reconciliation `ok: true`, and zero escrow, coupon liability and redemption reserve.

The demo script uses disposable Anvil unlocked accounts and refuses any chain ID other than 31337. Never attach it to real accounts. The browser/API do not hold those signing keys: use a wallet configured for local Anvil to sign prepared instructions, or download unsigned instructions for an external custody adapter.

### Individual services

```bash
# Separate terminals, after dependencies and contract build:
anvil --host 127.0.0.1 --chain-id 31337 --timestamp 1791504000
npm run demo
npm run api
npm run web
```

For a PostgreSQL server instead of embedded PostgreSQL:

```bash
docker compose up -d postgres
DATABASE_URL=postgres://atlas:local-synthetic-only@127.0.0.1:5432/atlas npm run api
```

The embedded adapter is **PGlite, a PostgreSQL engine compiled to WASM**, not an in-memory business-logic mock. Set `ATLAS_DB_PATH=work/postgres` for persistent local storage. Standalone PostgreSQL-server integration was not run on the delivery host because Docker was unavailable.

## Advanced setup: Hyperledger Besu + Polygon CDK / zkEVM bridge

Use a Besu QBFT private network for permissioned execution, or the official **Polygon CDK Besu sovereign configuration** for Agglayer connectivity and the zkEVM bridge. These are different from a zkEVM validity-proof rollup: vanilla Besu does not produce those proofs. Polygon zkEVM Mainnet Beta was sunset on **July 1, 2026**; do not use its old public RPC as a new deployment target.

The [advanced network and contract deployment guide](docs/besu-polygon-deployment.md) includes:

- Four-validator Besu quickstart and a pinned CDK Besu/Agglayer devnet configuration.
- RPC discovery, chain-ID checks, funded distinct signer roles and encrypted Foundry keystores.
- Copyable deployment commands for the registry, four compliance modules, factory-created security token, offering, DvP and corporate actions.
- Role handover, verification, deployment records, bridge restrictions and dashboard integration limits.

Compile compatible deployment artifacts from the Atlas repository root:

```bash
npm ci --prefix contracts --ignore-scripts
cd contracts
FOUNDRY_PROFILE=portable forge build
FOUNDRY_PROFILE=portable forge test
```

The `portable` profile targets Paris bytecode; it avoids post-Paris opcodes but does not certify every zkEVM fork. The guide deploys with `forge create` and signs with named accounts, rather than using the Anvil-only demo. Besu/CDK containers and bridge operation have **not** been exercised on the delivery host; the portable contract suite has been tested locally. [Official CDK Besu documentation](https://0xpolygon.github.io/kurtosis-cdk/configuration/examples/cdk-besu/) describes the integration; [Polygon's sunset announcement](https://forum.polygon.technology/t/polygon-zkevm-mainnet-beta-sunset-claim-your-funds/21856) explains the public network retirement.

## Architecture

```mermaid
flowchart LR
  Terminal[Next.js terminal] --> API[Fastify / unsigned transaction preparation]
  API --> RPC[Anvil RPC]
  API --> Indexer[Reorg-aware indexer]
  Indexer --> DB[(PostgreSQL)]
  Wallet[Investor or custody signer] --> RPC
  RPC --> Contracts[Permissioned lifecycle contracts]
  Indexer -->|canonical blocks and logs| RPC
  DB --> Reconcile[Event ledger reconciliation]
  RPC -->|block-tagged balances| Reconcile
```

```mermaid
flowchart TD
  Factory[AssetFactory] --> Token[SecurityToken]
  Token --> Identity[IdentityRegistry]
  Token --> Policy[Compliance]
  Policy --> J[JurisdictionRule]
  Policy --> H[HoldingLimitRule]
  Policy --> C[ConcentrationRule]
  Policy --> L[LockupRule]
  Offering[BondOffering / payment escrow] -->|mint| Token
  DvP[DvP / two-party consent] -->|atomic transfer| Token
  Actions[CorporateActions] -->|historical balances / retire| Token
```

## The bond walkthrough

1. Deploy the registry, policy strategies and authorized factory; create ATLAS-2030.
2. Assign separate admin, issuer, compliance officer, transfer agent and attester accounts.
3. Register two eligible synthetic investors and one restricted-jurisdiction investor.
4. Open subscriptions; escrow €5m mock EUR from each eligible investor. Reject the restricted investor.
5. Allocate and settle 5,000 bonds per investor. Revoke the bootstrap token issuer; only the offering can mint in the configured suite.
6. Execute a valid secondary transfer; reject a restricted transfer.
7. Exchange 200 bonds for €200,000 mock EUR through DvP. A missing cash approval demonstrates atomic rollback before successful execution.
8. Snapshot historical ownership, fund €50 per bond and claim €500,000 total. Reject a repeated claim.
9. Prefund principal, simulate maturity, redeem and burn the full supply.
10. Reconstruct balances from Transfer events and compare them to the chain at the indexed block.

Actual addresses, hashes and outcomes are in [examples/corporate-bond](examples/corporate-bond). `lifecycle-report.json` records the active stage, `redemption-report.json` records retirement, and the two snapshots preserve reconciliation before and after maturity. These are local chain records, not explorer links.

## Token standard decision

**ERC-3643 is the primary architectural direction, but this release is an explicitly documented reference subset.** It does not claim full ERC-3643 interface conformance or ERC-734/735 identity compatibility. ERC-20 comes from pinned OpenZeppelin Contracts 5.4.0; Atlas adds identity and policy enforcement. Mint/forced transfer use stricter policy checks than the ERC-3643 privileged exceptions.

ERC-1400/1410 partitions are not implemented: this bond has a single homogeneous class. Document and controller concepts do not imply ERC-1643/1644 interface compliance. Read [ADR 001](docs/decisions/001-token-standard.md) before integrating.

## Precision, settlement and corporate actions

Security tokens have **zero decimals**. Mock EUR has **six**. One bond costs `1_000_000_000` payment base units; a 5% annual coupon pays `50_000_000` per bond. Protocol and API amounts are integers/bigint/decimal strings.

Holding limits apply per registry subject through the single active wallet rule. Concentration uses **authorized issuance**, not circulating supply. The lifetime mint ceiling is not replenished after burns.

DvP instructions are immutable and require seller creation plus buyer acceptance. Execution is permissionless only after both consents. Both legs transfer in one transaction, and status changes roll back with a failed leg. Allowance-based execution does not guarantee settlement before inclusion.

Coupons use the last completed block's subject balances. Transferring securities afterward does not move past entitlements. Recovery preserves the subject, so it cannot produce a second claim. A per-whole-token amount avoids proportional dust; arbitrary total-pot distributions are unsupported. Frozen or expired identities retain unclaimed obligations until eligible again.

## Verification

**54 contract tests pass**, with two stateful invariant campaigns (128 runs × 64 calls each), plus fuzzed transfers, allocation, DvP and distributions. Contract-source coverage is **364/369 lines (98.64%)** and **104/150 branches (69.33%)**. Coverage is not a security guarantee.

Also verified: Solidity build/format, two PostgreSQL-engine indexer tests, strict TypeScript checks, Next.js production build, live API reconciliation, dependency audits and the complete local chain lifecycle.

Slither 0.11.3 completed with **24 reviewed findings**, including authorized instruction-based transferFrom calls, exact payment-delta comparisons and timestamp controls. CI compares findings with the checked-in reviewed baseline; it does not silently suppress all warnings. See [verification evidence](docs/VERIFICATION.md).

Standalone Playwright was attempted but Chrome could not launch inside the host sandbox. Equivalent navigation, simulation and responsive checks were performed in Codex's in-app browser and recorded in [browser-verification.json](docs/browser-verification.json). The Playwright suite is included for a normal host or CI; it is **not reported as passing locally**.

```bash
cd contracts
forge build
forge test -vv
forge coverage
forge fmt --check
# Optional focused demonstration:
forge test --match-test testTenMillionBondLifecycle -vvvv
```

```bash
npm run test:backend
npm run typecheck
npm run typecheck:web
npm run build:web
# With the local services running and Playwright Chromium installed:
npx playwright install chromium
npm run test:e2e
```

## Security and remaining boundaries

The administrator can grant itself roles; delayed admin transfer is not a timelock on every operation. Registrar/agent collusion remains a critical trust. Synthetic attestations do not verify real-world identity. Arbitrary rebasing/malicious payment tokens are unsupported. Real title, legal discharge, custody and finality require external institutions and processes.

The terminal serves a single demo suite. Its wizard deploys a new token against the existing registries, while the script deploys a complete new suite. Production IAM, multi-tenant administration, multi-asset portfolio discovery, standardized identity adapters, operational monitoring, standalone PostgreSQL-server verification and an independent audit remain roadmap work. No proxy upgrades, regulatory reporting or production custody integration are claimed.

See [threat model](docs/security/THREAT_MODEL.md), [regulatory mapping](docs/compliance/REGULATORY_CONTROL_MAPPING.md), [architecture](docs/ARCHITECTURE.md), [implementation status](docs/IMPLEMENTATION_PLAN.md) and [technical case study](docs/CASE_STUDY.md).

## License

MIT for Atlas source. OpenZeppelin retains its upstream MIT license; other dependencies retain their respective licenses. No modified third-party contract source is vendored.
