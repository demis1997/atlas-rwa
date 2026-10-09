# Contributing

Use Node 22.20+, Solidity 0.8.30 and Foundry. Install with `npm ci` and `npm ci --prefix contracts --ignore-scripts`. Keep protocol amounts as bigint or decimal strings, never JavaScript floating-point amounts. Add an ADR for changes to authority, accounting, token semantics or persistence boundaries.

Run `make check`, review Slither output, and test the local lifecycle. Add a regression test for a financial or security fix. Do not remove failing tests, silently broaden privileged bypasses or describe this project as certified/audited. Never commit private keys, real investor data, build output or database files.

Changes to contract code require a fresh local demo deployment; an existing immutable deployment cannot be updated by restarting the API. Do not publish or deploy beyond localhost without explicit approval.
