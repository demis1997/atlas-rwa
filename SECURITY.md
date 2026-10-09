# Security policy

Atlas RWA is an unaudited local reference. Do not use real assets, funds, identity records or production signing keys. No independent audit has taken place.

For a vulnerability, prepare a minimal reproduction and describe affected contract/function, preconditions, authority required and financial/accounting impact. This repository has no published security contact yet; arrange a private channel with its maintainer before public disclosure of a material exploit. Do not invent a contact address or treat an ordinary issue tracker as confidential.

See docs/security/THREAT_MODEL.md, docs/decisions/002-governance.md and docs/slither-final-results.txt. Admin can regrant roles; direct synthetic attestations are trusted; arbitrary payment tokens and public API hosting are unsupported. Node version 22.20+ is required. Dependencies are integrity locked; npm audit is only one component of dependency review.
