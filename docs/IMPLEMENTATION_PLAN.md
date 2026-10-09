# Implementation status

## Delivered and verified

**Phase 0 — Architecture:** monorepo, pinned Solidity/OpenZeppelin and TypeScript dependencies, six ADRs, threat model and CI configuration. Remote CI execution is not claimed.

**Phase 1 — Core:** token, identity registry, four policy modules, factory, freezing/recovery and role tests. Initial gate: 30 tests, build/format and coverage pass. Slither source-resolution issue fixed by locating contract dependencies inside the Foundry project.

**Phase 2 — Issuance:** state machine, subscriptions, escrow, allocation, refunds, cancellation and maturity exits. Gate: 38 aggregate tests pass. Bootstrap mint privilege is handed to the offering and revoked from the initial issuer in the demo.

**Phase 3 — Settlement:** two-party instructions, expiry/cancellation, atomic DvP and replay protection. Gate: 43 aggregate tests pass, including atomic rollback when cash approval is missing.

**Phase 4 — Corporate actions:** subject checkpoints, fully funded distributions and principal redemption. Gate: 45 aggregate tests pass, including a complete €10m bond integration test.

**Phase 5 — Backend:** strict TypeScript, Fastify, PostgreSQL engine persistence, canonical block/event storage, transaction states, unsigned preparation, audit records and reconciliation. Two embedded PostgreSQL tests pass. Live active and redeemed snapshots reconcile with zero mismatches. The normal PostgreSQL adapter and Docker configuration exist; standalone server integration remains unverified because Docker is unavailable on this host.

**Phase 6 — Terminal:** eleven views, live metrics/tables, holder distribution chart, wallet connection, typed operational forms, unsigned instruction simulation/download and token factory wizard. Production build/type checks pass. All navigation views, real instruction simulation and mobile overflow checks pass in the in-app browser. Actual screenshots saved. Standalone Playwright Chrome launch is blocked by the host sandbox; its tests have not passed locally.

**Phase 7 — Hardening:** 54 contract tests pass, including two stateful invariants, fees/reentrancy adversaries and distribution edge cases. Contract-source line coverage 364/369; branches 104/150. Slither completes with a reviewed baseline; npm audits report zero known vulnerabilities. Independent audit, Echidna and large-scale performance benchmarking are not claimed.

**Phase 8 — Demo/documentation:** approved local Anvil deployment executed through full redemption. €500,000 mock coupons and €10m mock principal paid; supply and remaining obligations zero. README, architecture, case study, regulatory mapping, run instructions and raw verification records delivered. No commit, push or public deployment.

## Static analysis disposition

24 findings remain visible in slither-final-results.txt and slither-baseline.json:

- Two arbitrary-from findings in DvP: seller creates an immutable instruction and buyer accepts it; execution cannot substitute a source address. Authorization, replay and rollback tests cover these paths.
- Three exact-balance comparisons: intentional rejection of fee/rebase behavior. Unsupported-token denial of service is accepted, not silently ignored.
- Three unused checkpoint return values: push stores the checkpoint; returned prior/current values are unnecessary.
- One external-call loop: at most 16 static policy calls. Governance can select a denial-of-service module; policy governance is trusted.
- Thirteen timestamp comparisons: intended expiry/maturity/lockup boundaries; sub-block timing guarantees are not made.
- Two storage-length gas suggestions: bounded loops, not security defects.

CI fails on unreviewed findings against the exact baseline. A matching baseline is not evidence of an independent audit.

## Deliberate scope limits and next work

The functioning reference lifecycle is delivered. It is not a claim that every institutional production requirement has been implemented. Full ERC-3643/734/735 conformance, production timelock/multisig setup, external custody, IAM, multi-asset suite orchestration in the wizard, automated regulatory reporting and production operations remain outside this release. The wizard creates a token; the deployment script creates the whole suite. Future changes should close these explicitly, not disguise them as complete.
