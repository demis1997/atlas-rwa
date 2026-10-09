# ADR 005 — Subject checkpoints and fully funded distributions

Security balances and supply checkpoint at each block with OpenZeppelin Checkpoints. Distribution creation uses the last completed block, preventing intra-block transient balances from being taken as a historical record. Historical queries use logarithmic lookup. Recovery leaves subject ownership unchanged, so existing entitlements follow the subject to its newly verified wallet. Claims key on distribution ID + subject, not wallet.

Coupons and dividends share a fully funded per-whole-token payment. For the bond, 5% × €1,000 is 50,000,000 mock-EUR base units per token, with no rounding residual. Arbitrary total-pot pro-rata distributions and fractional bond tokens are intentionally unsupported. A snapshot with no supply reverts. Funds cannot be reclaimed by the operator: unclaimed or frozen-holder obligations remain reserved indefinitely. No holder iteration is performed.

Full-wallet freezes block claims; partial security freezes do not block cash coupon entitlements. Expired/revoked identities must be reverified before claiming. Transfers after record block do not change historical entitlement. Recovery does not duplicate it.

Redemption requires offering maturity, a pre-funded segregated reserve, investor token allowance and a dedicated REDEEMER_ROLE. Tokens burn atomically with cash delivery. Administrative issuer burns remain a privileged risk; circulating supply alone is insufficient proof that principal was repaid. The current markRedeemed lifecycle transition therefore represents zero outstanding tokens, not independent proof of legal discharge. A future release should remove discretionary burns once active or reconcile burn reasons explicitly.
