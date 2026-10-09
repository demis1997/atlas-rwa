# Verification — 9 October 2026

Executed locally:

- Solidity 0.8.30 compilation and forge fmt --check pass.
- 54 Foundry tests pass, zero failed/skipped; see final-contract-test-results.txt. Includes bounded fuzz tests and two stateful invariants at 128 runs × 64 calls each.
- Contract-source line coverage: 364/369 (98.64%); branch coverage: 104/150 (69.33%). The raw total in final-coverage.txt includes test handlers, so it is not quoted as application-source coverage.
- Slither 0.11.3 analyzes 34 contracts using 100 detectors; 24 reviewed findings remain. See slither-final-results.txt and IMPLEMENTATION_PLAN.md. This is not a clean zero-findings audit.
- Strict backend and frontend TypeScript checks and Next.js production build pass.
- Four live API checks pass (docs/live-api-verification.json): final reconciliation, simulated preparation, unauthorized command rejection and idempotent reads with audit persistence.
- Two PostgreSQL-engine indexer tests pass: idempotent replay/reorganization and atomic rollback on inconsistent blocks.
- Local Anvil demo issued 10,000 bonds, settled DvP, paid €500,000 mock coupons, returned €10m mock principal, and burned the full supply. Final event-ledger reconciliation has zero mismatches and zero remaining escrow/distribution/redemption liabilities. Reports and snapshots are in examples/corporate-bond.
- npm audit reports zero known vulnerabilities for both lockfiles on this date.

Browser verification: the standalone Playwright command was executed but Chrome exited with SIGABRT/EPERM before either test ran. Do not interpret this as passing automated E2E. Codex's in-app browser successfully loaded the live terminal, navigated all ten other views and simulated an unsigned securities approval. Responsive checks and screenshots are recorded separately in browser-verification.json.

Unavailable/unexecuted: standalone PostgreSQL server integration (Docker unavailable), remote GitHub CI, Echidna, independent audit and wallet-extension signature UI. Foundry supplies stateful fuzzing; Echidna is optional and has not been represented as run. Local Foundry is 1.3.5-nightly; CI is pinned to stable 1.3.1 and has not been run remotely.

## Besu / Polygon CDK deployment profile

On October 9, 2026, the Paris-targeted `portable` Foundry profile passed all 54 contract tests (9 suites, zero failures). Every Bash block in the advanced deployment guide passed `bash -n`. The Docker-based Besu/CDK network, signed deployment recipe and bridge operation have not been executed on this host. The recipe was checked against the current constructor and role signatures and local Foundry CLI options.
