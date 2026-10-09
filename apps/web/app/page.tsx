"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
type Row = Record<string, unknown>;
type Snapshot = {
  source: {
    chainId: number;
    head: number;
    indexed: number;
    confirmedThrough: number;
    database: string;
    contracts: Record<string, string>;
  };
  asset: {
    name: string;
    symbol: string;
    issuer: string;
    nominalPerToken: string;
    authorizedSupply: string;
    supply: string;
    lifetimeIssued: string;
    state: number;
    paused: boolean;
    maturity: string;
    documentURI: string;
  };
  investors: {
    wallet: string;
    label: string;
    verified: boolean;
    country: string;
    balance: string;
    claimExpiry: string;
    eligible: boolean;
    frozen: boolean;
    subject: string;
  }[];
  subscriptions: Row[];
  settlements: Row[];
  distributions: Row[];
  obligations: {
    distribution: string;
    redemptionReserve: string;
    escrow: string;
  };
  reconciliation: { ok: boolean; ledgerSupply: string; mismatches: Row[] };
  events: Row[];
  transactions: Row[];
};
type Ethereum = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
const nav = [
  "Overview",
  "Assets",
  "Issuance",
  "Investors",
  "Compliance",
  "Subscriptions",
  "Settlement",
  "Corporate Actions",
  "Transactions",
  "Audit Trail",
  "Settings",
];
const lifecycle = [
  "Draft",
  "Approved",
  "Subscription open",
  "Allocated",
  "Issued",
  "Active",
  "Matured",
  "Redeemed",
  "Cancelled",
];
const short = (value: string) =>
  value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
function euro(raw: string, decimals = 0) {
  const units = BigInt(raw) / 10n ** BigInt(decimals);
  return `€${units.toLocaleString("en-GB")}`;
}
function Label({
  children,
  good = true,
}: {
  children: ReactNode;
  good?: boolean;
}) {
  return (
    <span className={`badge ${good ? "good" : "warning"}`}>{children}</span>
  );
}
function Grid({
  rows,
  columns,
}: {
  rows: Row[];
  columns: { key: string; label: string; render?: (r: Row) => ReactNode }[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render ? (
                      c.render(r)
                    ) : (
                      <span title={String(r[c.key] ?? "")}>
                        {String(r[c.key] ?? "—").startsWith("0x")
                          ? short(String(r[c.key]))
                          : String(r[c.key] ?? "—")}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty">
                No records at the indexed block.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
const operations: Record<
  string,
  { contract: string; method: string; fields: string[] }[]
> = {
  Investors: [
    {
      contract: "IdentityRegistry",
      method: "register",
      fields: [
        "Investor wallet",
        "Subject identifier (bytes32)",
        "Jurisdiction (ISO numeric)",
      ],
    },
    {
      contract: "IdentityRegistry",
      method: "attest",
      fields: [
        "Subject identifier (bytes32)",
        "Claim topic",
        "Expires at (Unix seconds)",
        "Evidence hash (bytes32)",
      ],
    },
    {
      contract: "IdentityRegistry",
      method: "revoke",
      fields: ["Subject identifier (bytes32)", "Claim topic"],
    },
    {
      contract: "IdentityRegistry",
      method: "rotate",
      fields: ["Lost wallet", "Replacement wallet"],
    },
  ],
  Issuance: [
    { contract: "BondOffering", method: "approveOffering", fields: [] },
    { contract: "BondOffering", method: "open", fields: [] },
    { contract: "BondOffering", method: "close", fields: [] },
    { contract: "BondOffering", method: "finalize", fields: [] },
    { contract: "BondOffering", method: "activate", fields: [] },
  ],
  Subscriptions: [
    { contract: "BondOffering", method: "subscribe", fields: ["Quantity"] },
    {
      contract: "BondOffering",
      method: "allocate",
      fields: ["Investor wallet", "Quantity"],
    },
    { contract: "BondOffering", method: "settle", fields: ["Investor wallet"] },
    { contract: "BondOffering", method: "cancelSubscription", fields: [] },
    { contract: "BondOffering", method: "claimRefund", fields: [] },
    { contract: "BondOffering", method: "reclaimUnsettled", fields: [] },
  ],
  Settlement: [
    {
      contract: "DvP",
      method: "propose",
      fields: [
        "Buyer wallet",
        "Security quantity",
        "Payment base units (6 decimals)",
        "Expiry (Unix seconds)",
      ],
    },
    { contract: "DvP", method: "accept", fields: ["Instruction ID"] },
    { contract: "DvP", method: "execute", fields: ["Instruction ID"] },
    { contract: "DvP", method: "cancel", fields: ["Instruction ID"] },
  ],
  "Corporate Actions": [
    {
      contract: "CorporateActions",
      method: "createDistribution",
      fields: ["Payment per token (6-decimal base units)"],
    },
    {
      contract: "CorporateActions",
      method: "claim",
      fields: ["Distribution ID"],
    },
    { contract: "CorporateActions", method: "redeem", fields: ["Quantity"] },
    { contract: "BondOffering", method: "mature", fields: [] },
    { contract: "BondOffering", method: "markRedeemed", fields: [] },
  ],
  Compliance: [
    {
      contract: "SecurityToken",
      method: "setPaused",
      fields: ["Paused (true or false)"],
    },
    {
      contract: "SecurityToken",
      method: "setFreeze",
      fields: ["Investor wallet", "Frozen (true or false)", "Frozen quantity"],
    },
    {
      contract: "SecurityToken",
      method: "recover",
      fields: ["Lost wallet", "Replacement wallet"],
    },
  ],
  Assets: [
    {
      contract: "SecurityToken",
      method: "transfer",
      fields: ["Recipient wallet", "Quantity"],
    },
    {
      contract: "SecurityToken",
      method: "approve",
      fields: ["Spender address", "Security quantity"],
    },
    {
      contract: "MockEUR",
      method: "approve",
      fields: ["Spender address", "Payment base units (6 decimals)"],
    },
  ],
};
function Command({ section, account }: { section: string; account: string }) {
  const options = operations[section];
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<string[]>([]);
  const [from, setFrom] = useState(account);
  const [result, setResult] = useState("");
  const [transaction, setTransaction] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    setIndex(0);
    setValues([]);
    setTransaction(null);
    setResult("");
  }, [section]);
  useEffect(() => setFrom(account), [account]);
  useEffect(() => {
    revision.current++;
    setTransaction(null);
    setResult("");
  }, [from, values, index, section]);
  if (!options) return null;
  const operation = options[index] ?? options[0]!;
  async function prepare() {
    const requestRevision = revision.current;
    setBusy(true);
    setTransaction(null);
    try {
      const args = operation.fields.map((f, i) => {
        if (f.includes("true or false")) {
          if (values[i] !== "true" && values[i] !== "false")
            throw new Error("Enter true or false explicitly.");
          return values[i] === "true";
        }
        return values[i] ?? "";
      });
      const response = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...operation, args, from, fields: undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (requestRevision !== revision.current) return;
      setTransaction(data.transaction);
      setResult(
        "Simulation passed. Review and sign using your wallet or custody provider.",
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Preparation failed");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    const ethereum = (window as Window & { ethereum?: Ethereum }).ethereum;
    if (!ethereum || !transaction) return;
    try {
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [transaction],
      });
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      setResult(`Submitted ${hash}`);
      setTransaction(null);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Wallet rejected");
    }
  }
  return (
    <section className="panel command">
      <div className="panel-title">
        <h2>Prepare an instruction</h2>
        <span>Simulation required · local chain only</span>
      </div>
      <div className="form-grid">
        <label>
          Action
          <select
            value={index}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setValues([]);
              setTransaction(null);
            }}
          >
            {options.map((o, i) => (
              <option key={`${o.contract}.${o.method}`} value={i}>
                {o.contract === "MockEUR"
                  ? "Approve payment"
                  : o.method === "approve"
                    ? "Approve securities"
                    : o.method.replace(/([A-Z])/g, " $1")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Signing wallet
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="0x…"
          />
        </label>
        {operation.fields.map((field, i) => (
          <label key={field}>
            {field}
            <input
              required
              value={values[i] ?? ""}
              onChange={(e) =>
                setValues((old) => {
                  const next = [...old];
                  next[i] = e.target.value;
                  return next;
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button onClick={prepare} disabled={busy || !from}>
          {busy ? "Simulating…" : "Simulate & prepare"}
        </button>
        {transaction && (
          <>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(transaction, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "atlas-instruction.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download unsigned instruction
            </button>
            {account && <button onClick={send}>Review in wallet</button>}
          </>
        )}
      </div>
      {result && (
        <p role="status" className="message">
          {result}
        </p>
      )}
    </section>
  );
}
function Wizard({ data, account }: { data: Snapshot; account: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Synthetic Corporate Bond");
  const [symbol, setSymbol] = useState("BOND");
  const [cap, setCap] = useState("10000");
  const [id, setId] = useState("");
  const [roles, setRoles] = useState(["", "", "", ""]);
  const [message, setMessage] = useState("");
  const [bundle, setBundle] = useState<Row | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setBundle(null);
    setMessage("");
  }, [name, symbol, cap, id, roles, account]);
  const steps = [
    "Asset class",
    "Terms",
    "Compliance",
    "Roles",
    "Review",
    "Prepare deployment",
    "Verify",
  ];
  async function prepare() {
    const requestRevision = revision.current;
    try {
      const response = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contract: "AssetFactory",
          method: "create",
          from: account,
          args: [
            id,
            name,
            symbol,
            cap,
            data.source.contracts.IdentityRegistry,
            data.source.contracts.Compliance,
            roles,
          ],
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      if (requestRevision !== revision.current) return;
      setBundle(value.transaction);
      setMessage(
        "Deployment simulated. Your wallet must authorize the transaction.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }
  async function deploy() {
    try {
      const ethereum = (window as Window & { ethereum?: Ethereum }).ethereum;
      if (!ethereum || !bundle) return;
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [bundle],
      });
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      setMessage(
        `Deployment submitted: ${hash}. Verify confirmation in Transactions; AssetCreated identifies the new token.`,
      );
      setStep(6);
    } catch (e) {
      setMessage(String(e));
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>New security token</h2>
        <span>Factory workflow</span>
      </div>
      <div className="steps">
        {steps.map((s, i) => (
          <span className={i === step ? "current" : ""} key={s}>
            {i + 1} {s}
          </span>
        ))}
      </div>
      <p className="muted">
        Creates a new bond token using this demonstration’s identity and
        compliance registries. Offering, settlement and corporate-action
        contracts require a separate suite deployment.
      </p>
      {step === 0 && (
        <p>Corporate bond · fungible whole units · permissioned holders</p>
      )}
      {step === 1 && (
        <div className="form-grid">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Symbol
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </label>
          <label>
            Authorized units
            <input value={cap} onChange={(e) => setCap(e.target.value)} />
          </label>
          <label>
            Unique asset ID (bytes32)
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="0x followed by 64 hexadecimal characters"
            />
          </label>
        </div>
      )}
      {step === 2 && (
        <p>
          Reuse the verified local registry and configured jurisdiction,
          holding, concentration and lockup modules. Review their addresses in
          Settings before signing.
        </p>
      )}
      {step === 3 && (
        <div className="form-grid">
          {[
            "Administrator",
            "Issuer",
            "Compliance officer",
            "Transfer agent",
          ].map((r, i) => (
            <label key={r}>
              {r}
              <input
                value={roles[i]}
                onChange={(e) =>
                  setRoles((old) =>
                    old.map((v, j) => (j === i ? e.target.value : v)),
                  )
                }
              />
            </label>
          ))}
        </div>
      )}
      {step === 4 && (
        <p>
          {name} ({symbol}) · {cap} units · four distinct authorities · local
          chain 31337. Nominal terms remain off-chain until a suite is
          configured.
        </p>
      )}
      {step === 5 && (
        <div className="actions">
          <button disabled={!account} onClick={prepare}>
            Simulate deployment
          </button>
          {bundle && (
            <button onClick={deploy}>Review deployment in wallet</button>
          )}
          <span className="muted">
            Connect an authorized factory-deployer wallet.
          </span>
        </div>
      )}
      {step === 6 && (
        <p>
          Open Transactions and refresh to check the submitted hash. An emitted
          AssetCreated event supplies the token address.
        </p>
      )}
      <div className="actions">
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        <button disabled={step >= 5} onClick={() => setStep(step + 1)}>
          Continue
        </button>
      </div>
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
    </section>
  );
}
export default function Terminal() {
  const [section, setSection] = useState("Overview");
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<Row[]>([]);
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/snapshot");
      if (!response.ok)
        throw new Error("API unavailable. Start local Anvil, demo and API.");
      setData(await response.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (section === "Audit Trail")
      fetch("/api/audit")
        .then((r) => r.json())
        .then((d) => setAudit(d.rows))
        .catch(() => setError("Audit API unavailable"));
    setQuery("");
  }, [section]);
  async function connect() {
    try {
      const ethereum = (window as Window & { ethereum?: Ethereum }).ethereum;
      if (!ethereum)
        throw new Error(
          "Install an Ethereum wallet and connect it to local Anvil (chain 31337). You can still inspect all live records.",
        );
      const chain = await ethereum.request({ method: "eth_chainId" });
      if (chain !== "0x7a69")
        throw new Error("Switch your wallet to local Anvil, chain ID 31337.");
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      setAccount(accounts[0] ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed");
    }
  }
  const filter = (rows: Row[]) =>
    rows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
    );
  const events = data?.events ?? [];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">A</span>
          <div>
            ATLAS<small>REAL WORLD ASSETS</small>
          </div>
        </div>
        <div className="workspace">
          <span className="dot" /> LOCAL WORKSPACE
          <small>Institutional reference terminal</small>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((item, i) => (
            <button
              key={item}
              aria-label={item}
              className={section === item ? "selected" : ""}
              onClick={() => setSection(item)}
            >
              <span className="nav-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              {item}
            </button>
          ))}
        </nav>
        <div className="aside-foot">
          <span className="dot" /> ANVIL / 31337
          <p>
            Synthetic assets. Simulated money.
            <br />
            Unaudited engineering reference.
          </p>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            <span className="breadcrumb">WORKSPACE / SECURITIES</span>
            <h1>{section}</h1>
          </div>
          <div className="header-actions">
            <Label>LOCALNET</Label>
            <button className="secondary" onClick={refresh} disabled={loading}>
              {loading ? "Syncing…" : "↻ Refresh"}
            </button>
            <button onClick={connect}>
              {account ? short(account) : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {!data ? (
            <div className="panel empty">
              {loading
                ? "Reading canonical chain state…"
                : "No live data loaded."}
            </div>
          ) : (
            <>
              <div className="context">
                <span>
                  <span className="dot" /> {data.asset.name}
                </span>
                <span>
                  Block {data.source.indexed} · confirmed through{" "}
                  {data.source.confirmedThrough}
                </span>
                <Label good={data.reconciliation.ok}>
                  {data.reconciliation.ok ? "RECONCILED" : "EXCEPTION"}
                </Label>
              </div>
              {section === "Overview" && (
                <>
                  <div className="hero">
                    <div>
                      <span className="eyebrow">SECURITIES OPERATIONS</span>
                      <h2>
                        A complete view of
                        <br />
                        your bond lifecycle.
                      </h2>
                      <p>
                        Atlas Capital Markets Ltd. · fictional issuer
                        <br />
                        5% annual coupon · maturity 31 December 2030
                      </p>
                    </div>
                    <div className="hero-status">
                      <span>ASSET STATE</span>
                      <strong>{lifecycle[data.asset.state]}</strong>
                      <small>
                        {data.asset.paused
                          ? "Transfers paused"
                          : "Permissioned transfers enabled"}
                      </small>
                    </div>
                  </div>
                  <div className="metrics">
                    {[
                      [
                        "Authorized notional",
                        euro(
                          String(BigInt(data.asset.authorizedSupply) * 1000n),
                        ),
                        "Factory cap × €1,000",
                      ],
                      [
                        "Outstanding principal",
                        euro(String(BigInt(data.asset.supply) * 1000n)),
                        `${data.asset.supply} whole bond units`,
                      ],
                      [
                        "Verified identities",
                        String(data.investors.filter((i) => i.verified).length),
                        `${data.investors.length} synthetic records; eligibility also needs policy`,
                      ],
                      [
                        "Pending settlements",
                        String(
                          data.settlements.filter((s) =>
                            [1, 2].includes(Number(s.status)),
                          ).length,
                        ),
                        "Proposed + accepted instructions",
                      ],
                    ].map(([label, value, source]) => (
                      <article className="metric" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{source}</small>
                      </article>
                    ))}
                  </div>
                  <div className="two-col">
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Holder distribution</h2>
                        <span>On-chain balance</span>
                      </div>
                      {data.investors.map((i, index) => (
                        <div className="holder" key={i.wallet}>
                          <div>
                            <span className={`legend l${index}`} />
                            {i.label}
                            <strong>
                              {Number(i.balance).toLocaleString()} units
                            </strong>
                          </div>
                          <div className="bar">
                            <span
                              style={{
                                width: `${Number(data.asset.supply) > 0 ? (Number(i.balance) / Number(data.asset.supply)) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </section>
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Cash obligations</h2>
                        <span>mockEUR</span>
                      </div>
                      {[
                        [
                          "Coupon liability",
                          euro(data.obligations.distribution, 6),
                        ],
                        [
                          "Principal reserved",
                          euro(data.obligations.redemptionReserve, 6),
                        ],
                        [
                          "Subscription escrow",
                          euro(data.obligations.escrow, 6),
                        ],
                      ].map(([a, b]) => (
                        <div className="obligation" key={a}>
                          <span>{a}</span>
                          <strong>{b}</strong>
                        </div>
                      ))}
                      <p className="muted">
                        Funded liabilities read directly from contract storage.
                      </p>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Recent lifecycle activity</h2>
                      <button
                        className="text-button"
                        onClick={() => setSection("Audit Trail")}
                      >
                        View event ledger →
                      </button>
                    </div>
                    <Grid
                      rows={events.slice(0, 7)}
                      columns={[
                        { key: "name", label: "Event" },
                        { key: "block_number", label: "Block" },
                        { key: "tx_hash", label: "Transaction" },
                        { key: "address", label: "Contract" },
                      ]}
                    />
                  </section>
                </>
              )}
              {section !== "Overview" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        {section === "Assets" ? data.asset.name : section}
                      </h2>
                      <p className="muted">
                        Live local records · indexed block {data.source.indexed}
                      </p>
                    </div>
                    {section !== "Issuance" && (
                      <label className="search-label">
                        Filter records
                        <input
                          aria-label="Filter records"
                          placeholder="Search wallet, status or hash…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                  {section === "Assets" && (
                    <section className="panel">
                      <Grid
                        rows={filter(
                          Object.entries(data.asset).map(([field, value]) => ({
                            field,
                            value: String(value),
                          })),
                        )}
                        columns={[
                          { key: "field", label: "Property" },
                          {
                            key: "value",
                            label: "Value",
                            render: (r) => String(r.value),
                          },
                        ]}
                      />
                    </section>
                  )}
                  {section === "Issuance" && (
                    <>
                      <section className="panel">
                        <div className="panel-title">
                          <h2>Current bond lifecycle</h2>
                          <Label>{lifecycle[data.asset.state]}</Label>
                        </div>
                        <div className="steps">
                          {lifecycle.slice(0, 8).map((s, i) => (
                            <span
                              className={
                                i === data.asset.state ? "current" : ""
                              }
                              key={s}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                        <p>
                          {data.asset.lifetimeIssued} units issued against{" "}
                          {data.asset.authorizedSupply} authorized. Burning
                          never restores issuance capacity.
                        </p>
                      </section>
                      <Wizard data={data} account={account} />
                    </>
                  )}
                  {section === "Investors" && (
                    <section className="panel">
                      <Grid
                        rows={filter(data.investors)}
                        columns={[
                          {
                            key: "label",
                            label: "Synthetic investor",
                            render: (r) => String(r.label),
                          },
                          { key: "wallet", label: "Wallet" },
                          {
                            key: "country",
                            label: "Jurisdiction (ISO numeric)",
                          },
                          { key: "balance", label: "Holdings" },
                          {
                            key: "verified",
                            label: "Identity",
                            render: (r) => (
                              <Label good={Boolean(r.verified)}>
                                {r.verified ? "Verified" : "Invalid"}
                              </Label>
                            ),
                          },
                          {
                            key: "claimExpiry",
                            label: "Claim expiry",
                            render: (r) =>
                              new Date(Number(r.claimExpiry) * 1000)
                                .toISOString()
                                .slice(0, 10),
                          },
                          {
                            key: "eligible",
                            label: "Can receive",
                            render: (r) =>
                              r.eligible ? "Eligible" : "Restricted",
                          },
                          {
                            key: "frozen",
                            label: "Freeze",
                            render: (r) => (r.frozen ? "Frozen" : "Clear"),
                          },
                        ]}
                      />
                    </section>
                  )}
                  {section === "Compliance" && (
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Control state</h2>
                        <Label good={!data.asset.paused}>
                          {data.asset.paused ? "PAUSED" : "ENFORCING"}
                        </Label>
                      </div>
                      <p>
                        Mandatory contract identity checks, lifetime cap,
                        address and partial freezes. Registry and module
                        addresses are shown in Settings.
                      </p>
                      <p className="muted">
                        The demo configures Germany (276), 6,000-unit holdings,
                        60% of authorized issuance concentration, and released
                        lockup. These are demo configuration parameters, not a
                        certification of legal eligibility.
                      </p>
                      <Grid
                        rows={filter(data.investors)}
                        columns={[
                          { key: "label", label: "Subject" },
                          {
                            key: "verified",
                            label: "Claims",
                            render: (r) => (r.verified ? "Valid" : "Invalid"),
                          },
                          { key: "country", label: "Jurisdiction" },
                          {
                            key: "frozen",
                            label: "Frozen",
                            render: (r) => String(r.frozen),
                          },
                        ]}
                      />
                    </section>
                  )}
                  {section === "Subscriptions" && (
                    <section className="panel">
                      <Grid
                        rows={filter(data.subscriptions)}
                        columns={[
                          { key: "wallet", label: "Investor" },
                          { key: "requested", label: "Requested" },
                          { key: "allocated", label: "Allocated" },
                          {
                            key: "status",
                            label: "Status",
                            render: (r) =>
                              [
                                "None",
                                "Pending",
                                "Allocated",
                                "Settled",
                                "Cancelled",
                                "Rejected",
                              ][Number(r.status)],
                          },
                          {
                            key: "refund",
                            label: "Refund",
                            render: (r) => euro(String(r.refund), 6),
                          },
                        ]}
                      />
                    </section>
                  )}
                  {section === "Settlement" && (
                    <section className="panel">
                      <Grid
                        rows={filter(data.settlements)}
                        columns={[
                          { key: "id", label: "Instruction" },
                          { key: "seller", label: "Seller" },
                          { key: "buyer", label: "Buyer" },
                          { key: "quantity", label: "Security units" },
                          {
                            key: "consideration",
                            label: "Payment",
                            render: (r) => euro(String(r.consideration), 6),
                          },
                          {
                            key: "status",
                            label: "Status",
                            render: (r) => (
                              <Label good={Number(r.status) === 3}>
                                {
                                  [
                                    "None",
                                    "Proposed",
                                    "Accepted",
                                    "Settled",
                                    "Cancelled",
                                  ][Number(r.status)]
                                }
                              </Label>
                            ),
                          },
                        ]}
                      />
                    </section>
                  )}
                  {section === "Corporate Actions" && (
                    <section className="panel">
                      <Grid
                        rows={filter(data.distributions)}
                        columns={[
                          { key: "id", label: "Distribution" },
                          { key: "recordBlock", label: "Record block" },
                          {
                            key: "perToken",
                            label: "Per bond",
                            render: (r) => euro(String(r.perToken), 6),
                          },
                          {
                            key: "funded",
                            label: "Funded",
                            render: (r) => euro(String(r.funded), 6),
                          },
                          {
                            key: "claimed",
                            label: "Paid",
                            render: (r) => euro(String(r.claimed), 6),
                          },
                        ]}
                      />
                      <div className="obligation">
                        <span>Principal reserve</span>
                        <strong>
                          {euro(data.obligations.redemptionReserve, 6)}
                        </strong>
                      </div>
                    </section>
                  )}
                  {section === "Transactions" && (
                    <section className="panel">
                      <Grid
                        rows={filter(data.transactions)}
                        columns={[
                          { key: "hash", label: "Transaction hash" },
                          {
                            key: "status",
                            label: "Confirmation state",
                            render: (r) => (
                              <Label good={r.status === "confirmed"}>
                                {String(r.status)}
                              </Label>
                            ),
                          },
                          { key: "block_number", label: "Block" },
                          { key: "block_hash", label: "Canonical block hash" },
                        ]}
                      />
                    </section>
                  )}
                  {section === "Audit Trail" && (
                    <>
                      <section className="panel">
                        <div className="panel-title">
                          <h2>Canonical event ledger</h2>
                          <span>Latest 100 logs</span>
                        </div>
                        <Grid
                          rows={filter(events)}
                          columns={[
                            { key: "name", label: "Event" },
                            { key: "block_number", label: "Block" },
                            { key: "tx_hash", label: "Transaction" },
                            {
                              key: "args",
                              label: "Payload",
                              render: (r) => (
                                <details>
                                  <summary>Inspect</summary>
                                  <pre>{JSON.stringify(r.args, null, 2)}</pre>
                                </details>
                              ),
                            },
                          ]}
                        />
                      </section>
                      <section className="panel">
                        <h2>Transaction preparation audit</h2>
                        <Grid
                          rows={filter(audit)}
                          columns={[
                            { key: "id", label: "ID" },
                            { key: "action", label: "Action" },
                            { key: "created_at", label: "Time" },
                            {
                              key: "payload",
                              label: "Command",
                              render: (r) => JSON.stringify(r.payload),
                            },
                          ]}
                        />
                      </section>
                    </>
                  )}
                  {section === "Settings" && (
                    <section className="panel">
                      <h2>Local environment</h2>
                      <p>
                        Chain {data.source.chainId} · {data.source.database} ·
                        two-block confirmation depth
                      </p>
                      <p>
                        RPC: http://127.0.0.1:8545 · API: http://127.0.0.1:3001
                      </p>
                      <Grid
                        rows={filter(
                          Object.entries(data.source.contracts).map(
                            ([name, address]) => ({ name, address }),
                          ),
                        )}
                        columns={[
                          { key: "name", label: "Contract" },
                          {
                            key: "address",
                            label: "Deployed address",
                            render: (r) => <code>{String(r.address)}</code>,
                          },
                        ]}
                      />
                    </section>
                  )}
                  <Command section={section} account={account} />
                </>
              )}
              <footer>
                <span>ATLAS RWA / ENGINEERING REFERENCE</span>
                <span>
                  Every metric traces to local contract state or canonical
                  events.
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
