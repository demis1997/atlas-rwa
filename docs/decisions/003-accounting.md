# ADR 003 — Units and policy semantics

Bond tokens have zero decimals. The target issuance is 10,000 whole tokens, each representing fictional €1,000 principal. A later mock EUR payment contract will use six decimal places: one bond therefore costs 1,000,000,000 payment base units. All values use integers.

The lifetime mint counter, not just circulating supply, is capped. Burning cannot reopen issuance capacity. Holding and concentration rules are separate replaceable immutable modules. Concentration is a percentage of authorized issuance, rounded down, not current supply: a percentage of circulating supply makes initial allocations impossible without batch issuance. This denominator must be displayed clearly in the future UI.

One active wallet per subject and a token-level subject-holder check prevent simple wallet rotation from evading holdings caps. The registrar can still assign multiple synthetic subjects to the same actual entity; deduplication is an external identity-provider obligation. Self transfers do not increase holdings. There are no unbounded loops over holders; topics and rules are bounded at 16.

Subsequent phases implement escrow and maturity (ADR 004) and historical entitlement/redemption accounting (ADR 005). The whole-token per-unit distribution model avoids proportional dust; partial-period coupon accrual and day-count conventions remain unsupported.
