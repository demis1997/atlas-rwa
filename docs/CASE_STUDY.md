# Engineering a local securities lifecycle

The difficult part of the bond is keeping identity, balances, cash and historical entitlements consistent across several independently authorized actors. A token factory alone does not solve that problem.

The core uses a single checked ERC-20 update path. TransferFrom and forced transfer cannot escape the same identity, jurisdiction, holding and freeze restrictions. Recovery is separate because a lost wallet may no longer be verified; it requires registrar rotation followed by a transfer agent, preserves frozen quantities and refuses a different identity. Tracking subjects in both the registry and token prevents a rotated wallet from receiving a second holding allowance before its old balance is recovered.

ERC-3643 supplies the architectural direction. Its complete interface and identity model were not copied superficially: the repository calls its simplified synthetic claims a reference subset. ERC-1400 partitions were rejected because this single-class bond has no partition-specific rights. Immutability was chosen over proxies because this demonstration has no justified live-upgrade requirement. That shifts operational burden to explicit migration, which is easier to inspect than unneeded upgrade powers.

Primary subscriptions use escrow because allocation happens after subscription. Secondary DvP uses allowances and two explicit consents because a trade can exchange both legs in one EVM transaction. Cash is transferred after securities, and a failing cash transfer reverses the securities movement too. Tests deliberately omit cash approval and use a fee-charging token to prove the rollback path.

Coupons use subject checkpoints at the previous completed block, not balances at claim time. A holder can sell after record date and retain the coupon; a recovered wallet inherits the same subject entitlement without claiming twice. Whole denominations and a per-token coupon avoid proportional rounding dust. Redemption uses a separate funded reserve and allowance-based burn role.

The off-chain ledger treats logs as reversible observations. A canonical block chain is retained, duplicate events are idempotent, and a changed tip removes orphaned logs in the same PostgreSQL transaction as replay. Reconciliation folds Transfer events and compares reconstructed holdings and supply with a block-tagged chain read. Tests replace a same-height branch and inject inconsistent parent linkage rather than only asserting a happy-path database insert.

Tooling exposed an important verification limitation: dependencies outside the Foundry project caused source identity problems in coverage and Slither. Moving npm contract dependencies inside the Foundry root resolved both. The standalone Chrome runner was blocked by this host's sandbox; interactive browser checks were run separately and reported honestly rather than presenting failed launches as successful automated E2E runs.

The remaining trust is substantial: an administrator can grant privileges, a registrar can invent identities, operators choose distributions, and a blockchain does not establish legal title or asset backing. The point of the reference is to make those boundaries observable and testable. Production authentication, regulated custody, independent audit and organizational controls are further work.
