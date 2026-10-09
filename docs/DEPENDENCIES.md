# Dependency boundary

Contract compiler: Solidity 0.8.30, Cancun EVM. OpenZeppelin Contracts 5.4.0 is unmodified and installed from its separate npm integrity lock under contracts. Its MIT license is retained in the installed package.

Application dependencies are exactly pinned in the root package.json and package-lock.json: Next.js 16.4.0, React 19.3.0, Fastify 5.12.5, ethers 6.17.0, pg 8.23.1 and PGlite 0.5.8. TypeScript 5.9.3 is pinned with strict mode. Node 22.20+ is required. npm audit found no known vulnerabilities in either lockfile during delivery; that result is date-specific.

Slither 0.11.3 is installed in an isolated development environment on this host and pinned in CI. Local Foundry is 1.3.5-nightly; the CI toolchain uses 1.3.1. Remote CI has not been executed. GitHub Actions use version tags, so action-SHA pinning is an additional supply-chain hardening item.

PGlite is used only as a local PostgreSQL engine adapter, while pg targets the PostgreSQL server defined in docker-compose.yml. Neither implementation changes the SQL event/indexing semantics. No real custody or external identity-provider SDK is included.
