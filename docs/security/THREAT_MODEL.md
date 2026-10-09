# Threat model — reference core

Assets: bond balances, lifetime issuance ceiling, role authority, identity bindings and transfer-policy integrity. Adversaries: unauthorized callers, compromised issuer/registrar/agent/admin, malicious modules and users with stale identity claims. Trust assumptions: EVM execution, OpenZeppelin 5.4.0 primitives, truthful synthetic attesters and correct governance choices.

* Admin compromise: roles can be reassigned, including self-grant. Delayed admin transfer does not delay those grants. Residual critical trust; production timelock/multisig unimplemented.
* Issuer compromise: can mint up to lifetime cap and burn eligible unfrozen holdings. No economic backing is proven. Issuance state gating is a subsequent phase.
* Agent compromise: cannot bypass eligibility, policy or freezes through forced transfers. Same-subject recovery additionally needs registrar rotation. Colluding registrar/agent can still steal; operational dual control is necessary.
* Registrar/attester compromise: fake subjects or claims enable unauthorized participants. Trust revocation and expiry fail closed; real identity verification and identity deduplication are external.
* Identity reassignment: duplicate subjects are rejected, retired wallets cannot be reactivated, token balances remain bound to their recorded subject pending recovery. Rotation across multiple assets needs coordinated recovery and reconciliation.
* Policy compromise: officer can replace all strategies; malicious rules may reject all activity or permit broader holdings. Token identity checks and lifetime issuance cap remain mandatory. Bounded modules limit loop gas but malicious modules can still deny service.
* Transfer ordering: policy/claim changes before inclusion can make a previously successful precheck fail. Prechecks are advisory, execution authoritative.
* Arithmetic: checked integers, whole security units, concentration rounds down. Mint capacity never replenishes after burning. Fuzz and stateful invariant tests cover supply/holdings.
* Reentrancy: policy and registry lookups are static calls. Payment modules use ReentrancyGuard and effects before interactions; adversarial tests cover callback execution and fee-charging cash rollback. A fully malicious token can lie about balances; only the configured mock payment implementation is supported.
* Signature/settlement replay: signed transactions use chain-level nonces; there are no off-chain application signatures. DvP uses monotonic instruction IDs, explicit buyer consent and terminal status; repeated execution reverts.
* Upgrade compromise: no proxies or upgrade entry points. New deployments require an explicit migration plan.
* Indexer inconsistency, finality and reorgs: canonical events are keyed by chain ID + block hash + transaction hash + log index, with rollback and replay. A same-height reorganization and inconsistent read are tested against PostgreSQL. Two local descendant blocks are not irreversible finality; production confirmation policy remains chain-specific.
* Oracle/custody risk: no oracle or external custody integration. Asset backing, legal title and off-chain cash settlement cannot be established by these contracts.
* Distribution double claim, malicious payment tokens, redemption and rounding dust: subject-keyed claims and segregated funded liabilities are tested, including repeat claims, recovery, transfers after record block, insufficient funding, multiple distributions and integer per-token payouts. Redemption burns against an investor allowance atomically with cash delivery. Arbitrary cash tokens, tax handling, fractional coupons and production-scale performance remain outside the reference.

This is unaudited software for fictional local assets. It is not production-certified or an authorization to issue securities. Security tests are evidence of specific behaviors, not an independent audit.
