# ADR 001 — ERC-3643 direction, explicit reference subset

Status: accepted for reference core; full ERC-3643 conformance remains open.

The flagship bond has fungible whole €1,000 denominations, identity gating and issuer/agent operations. ERC-3643 is the preferred direction. ERC-20 alone supplies neither eligibility nor recovery. ERC-1400 combines a different family of security-token interfaces; ERC-1410 partitions are useful for tranches with distinct rights but introduce balance, allowance and distribution complexity without a requirement in this single-class bond. Do not mix their interfaces into a purported universal standard.

ERC-1594 concerns issuance/redemption and transfer validation, ERC-1643 document references and ERC-1644 controller operations. These are design comparisons, not interface claims. No partition module is implemented.

Implemented: standard OpenZeppelin ERC-20 ABI, on-chain identity checks, expiry/revocation, separate policy modules, free-balance checks, pause, mint/burn, document hash/URI, restricted forced transfer and same-subject recovery. `canTransfer(from,to,amount)` is a custom token precheck. Modules are read-only strategies; there are no ERC-3643 post-transfer hooks.

Deviations: AccessControl roles instead of ERC-173 owner/IAgentRole; no standard batch methods; direct mock issuer transactions instead of ERC-734 keys/ERC-735 signed claims; custom registry ABI; immutable registry/policy addresses; no standardized document interface. Mint and forced transfers enforce policy, unlike the standard's privileged exceptions. Burns enforce sender eligibility and freezing. Therefore the current release is **ERC-3643-inspired, not ERC-3643 compliant**. Migrating to the full standard needs interface and behavioral conformance tests and real claim adapters.

The canonical T-REX suite is a candidate for a later integration. It has not been vendored: licensing, dependency and version assessment must precede adoption. OpenZeppelin Contracts 5.4.0 is pinned via npm integrity lock; no third-party source modifications.

Source reviewed: https://eips.ethereum.org/EIPS/eip-3643 (2026-10-09). Its transfer section explicitly distinguishes ordinary transfers from mint/forced-transfer exceptions. Other ERC family comparisons must be validated against their canonical specifications before claiming interoperability.

Additional primary references: [ERC-1400 family proposal](https://github.com/SecurityTokenStandard/EIP-Spec/blob/master/eip/eip-1400.md), [ERC-735 claim holder proposal](https://github.com/ethereum/EIPs/issues/735). ERC-734 key management and ERC-735 claim execution/signature semantics are not implemented by this direct-attestation registry.
