# Atlas RWA architecture

The local reference includes immutable Solidity contracts, a PostgreSQL event ledger, strict TypeScript Fastify API, ethers SDK adapter and Next.js terminal. All amounts are whole security units or six-decimal mock-EUR integers.

```mermaid
flowchart LR
  Wallet[Investor / institutional wallet] -->|signed local transactions| Chain[Anvil 31337]
  UI[Next.js terminal] --> API[Fastify API]
  API -->|simulate unsigned commands| Chain
  API --> Indexer[Canonical block indexer]
  Indexer -->|block hash / logs| Chain
  Indexer --> PG[(PostgreSQL)]
  API -->|reconcile at indexed block| PG
  Registrar --> Registry[Identity registry]
  Attester --> Registry
  Chain --> Factory[Asset factory]
  Factory --> Token[Security token]
  Token --> Registry
  Token --> Compliance[Policy modules]
  Offering[Subscription escrow] --> Token
  DvP[Atomic DvP] --> Token
  Corporate[Subject snapshots / redemption] --> Token
```

Contracts enforce authorization, eligibility and accounting. The API never replaces those checks and holds no private keys. Transaction preparation is not authorization: the real signer must submit. The local demo alone uses Anvil's disposable unlocked accounts, guarded by chain ID 31337.

Persistence uses a dedicated PostgreSQL client and serialized operations. PGlite provides the local embedded PostgreSQL adapter; DATABASE_URL selects a PostgreSQL server. RPC reads are block-tagged for reconciliation. Reorg replay changes the derived ledger; it never sends compensating blockchain transactions.

Identity metadata is synthetic and public. Document hashes are not encryption. No identity documents or sensitive KYC material belong on-chain.

See decisions/ for standard compatibility, governance, precision, settlement, corporate actions and off-chain tradeoffs. The dashboard currently targets one deployed demo suite. Its new-token wizard prepares real factory transactions but does not orchestrate a new multi-contract suite; use the deployment script for that.
