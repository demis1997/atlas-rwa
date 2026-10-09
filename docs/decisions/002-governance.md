# ADR 002 — Immutable contracts and separate authority

Use immutable deployments, not UUPS, transparent or beacon proxies. A local reference has no live upgrade requirement. Proxies add initializer, storage collision, upgrade authorization and fleet-wide compromise risks. A future version migrates explicitly to a new factory/token after holder reconciliation; existing allowances and historical entitlements do not automatically migrate.

OpenZeppelin AccessControlDefaultAdminRules gives a two-day two-step default-admin handover. This is NOT a timelock on role grants or policy changes. Admin can grant itself operating privileges, so compromise of admin remains critical. Production governance would require a timelock/multisig deployment and organizational segregation. All admin parameters accept contract addresses; no tx.origin/EOA assumptions.

Initial issuer, compliance officer, transfer agent and administrator must be distinct, nonzero accounts. Factory deployer is separate from its administrator. Registrar configures trusted issuers and mandatory claim topics; attesters publish or revoke their own synthetic claims. A registrar can also revoke. Officers can remove rules, so policy composition remains a governance trust boundary.

Recovery requires registrar rotation plus transfer-agent execution, same subject, empty recipient and valid destination policy. Old eligibility is the sole identity exception, and freezes move with holdings. A revoked or expired investor cannot recover until reattested. Rotation permanently retires an old wallet. There is deliberately no universal confiscation bypass.
