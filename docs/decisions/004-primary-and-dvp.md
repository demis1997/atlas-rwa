# ADR 004 — Primary escrow and authorized atomic execution

Primary subscriptions escrow a fixed six-decimal mock payment token. Investors can cancel while open, claim rejected/unallocated amounts and reclaim unresolved subscriptions after maturity or an issuer abort. All refunds are pull-based. The issuer chooses allocations; anyone may trigger already-authorized settlement. Grant token ISSUER_ROLE to the offering and revoke the bootstrap issuer before opening. Until that handover, issuer direct minting can consume offering capacity. This role handover is a deployment requirement, tested in OfferingTest.

DvP instead uses allowances, immutable instructions and separate buyer acceptance. No cash/securities are locked before execution; counterparties can revoke allowances or spend balances, causing failure rather than guaranteed settlement. Either party can cancel until execution. Same-chain atomic execution transfers the security first, cash second: any failure rolls back both transfers and status. IDs monotonically increase in a contract; instructions cannot be replayed. No off-chain signatures or custom cryptography are used.

Each DvP instance pins both assets. Cash balance deltas reject fee-on-transfer behavior; arbitrary malicious or rebasing tokens remain unsupported. Production deployments must allowlist payment implementations. Reentrancy guards protect token interactions. Execution is permissionless only after both counterparties authorize that exact instruction.

Remaining concerns: governance mint privilege, transaction ordering before cancellation, no settlement guarantee before confirmation, and no legal finality claim.
