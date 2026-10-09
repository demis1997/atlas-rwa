# Advanced deployment: Besu, Polygon CDK and the zkEVM bridge

Reference checked October 9, 2026. This is a development runbook for synthetic assets. It does not deploy anything automatically. Docker-based networks were not run on the delivery host.

## 1. Choose the network architecture

**Besu QBFT** provides consortium execution and finality. **CDK Besu sovereign** adds Agglayer connectivity with the zkEVM bridge and AggKit. Its upstream demo uses one QBFT validator and a mock prover; it is not a production topology or a proof of Ethereum-equivalent ZK execution. The supported consensus contract in that configuration is `ecdsa-multisig`; use its paired component versions. Besu produces no validity proof. AggKit versions before 0.9 have a documented QBFT block-hash incompatibility in this integration.

If ZK execution proofs are mandatory, evaluate the separate [CDK execution configurations](https://0xpolygon.github.io/kurtosis-cdk/) and their prover/consensus compatibility. Replacing their execution client with vanilla Besu does not create a zkEVM. Do not deploy to the former public Polygon zkEVM Mainnet Beta: its sequencer was sunset July 1, 2026.

### Option A: standalone Besu QBFT

Install Docker with Compose v2, Node.js, curl and Foundry. Generate the [official Besu developer quickstart](https://docs.besu-eth.org/private-networks/tutorials/quickstart/) in a directory outside this repository:

```bash
npx @consensys-software/besu-dev-quickstart --networkType private --outputPath ./besu-test-network --otel false --chainlens true
cd besu-test-network
./run.sh
./list.sh
```

This creates four validators and an RPC node. Record the generator version, generated genesis hash and Docker image digests before reusing the environment. Default RPC is `http://127.0.0.1:8545`, with Grafana on port 3000: stop the Atlas local runner first or change the generated host mappings. Bind RPC to loopback, restrict CORS/host allowlists, and use a firewall or authenticated gateway for remote access. Use `./stop.sh` and `./resume.sh` to preserve state; `./remove.sh` destroys the local network data.

### Option B: Besu + Polygon CDK / Agglayer sovereign devnet

Install Docker and the [Kurtosis CLI](https://docs.kurtosis.com/install/), plus git. Fetch the upstream snapshot that contains the Besu configuration:

```bash
git clone https://github.com/0xPolygon/kurtosis-cdk.git
cd kurtosis-cdk
git checkout ed8fac443ff48b6ad243e449d514bcef716c2bd5
kurtosis run --enclave atlas-besu --args-file .github/tests/besu/sovereign-ecdsa-multisig.yml .
kurtosis enclave inspect atlas-besu
```

This commit pin fixes the package configuration, not every downloaded image digest. Save the resolved image list and digests for reproducibility. Follow the upstream version matrix when upgrading. The configuration starts local L1, sovereign bridge contracts, Agglayer, AggKit and Besu. It uses zero base fee and accepts zero-priced transactions. Follow `latest` for head tracking: this configuration does not supply `safe`/`finalized` block tags.

Copy the host-exposed **Besu L2 HTTP RPC** endpoint from `enclave inspect`; do not select the L1 RPC or guess a fixed port. Use the displayed service name and port ID with `kurtosis port print atlas-besu <service-name> <http-port-id>` if necessary. Keep the enclave while testing; removing it deletes your development chain. Inspect upstream `besu_validator_private_key`, block cadence, epoch, timeout and gas-limit settings before extending the topology. Validator keys and application signers have separate responsibilities.

## 2. Prepare signers and check the chain

From the Atlas repository root, install the contract dependencies and enter `contracts/`. Requires Bash, jq, Foundry and a reachable RPC.

```bash
npm ci --prefix contracts --ignore-scripts
cd contracts
export FOUNDRY_PROFILE=portable
export RPC_URL='http://127.0.0.1:8545' # replace with the chosen Besu L2 endpoint
export CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
cast rpc --rpc-url "$RPC_URL" web3_clientVersion
cast block-number --rpc-url "$RPC_URL"
forge build
forge test
```

Verify the returned chain ID against the generated genesis and deployment intent. The Paris profile avoids PUSH0/MCOPY/transient-storage generation; validate the actual chain fork and block gas limits before deployment. This does not assert zkEVM conformance.

Import five **distinct development accounts** using encrypted keystores. `--interactive` requests the key and encryption password locally; never commit either. Foundry stores named accounts in its local keystore directory outside this repository.

```bash
cast wallet import atlas-admin --interactive
cast wallet import atlas-issuer --interactive
cast wallet import atlas-officer --interactive
cast wallet import atlas-agent --interactive
cast wallet import atlas-attester --interactive
export ADMIN="$(cast wallet address --account atlas-admin)"
export ISSUER="$(cast wallet address --account atlas-issuer)"
export OFFICER="$(cast wallet address --account atlas-officer)"
export AGENT="$(cast wallet address --account atlas-agent)"
export ATTESTER="$(cast wallet address --account atlas-attester)"
export TREASURY="$ISSUER" # synthetic example; choose custody treasury for other environments
```

Fund accounts through your devnet's prefunded faucet account, or allocate balances in genesis before initialization. Every transaction sender needs gas funds on a fee-charging network. On the zero-fee local Besu configurations below, use `--legacy --gas-price 0`. For other networks, remove those two flags and use the actual fee policy. Do not use publicly documented test keys with real funds.

## 3. Deploy and wire all contracts

Run the following in the same Bash shell inside `contracts/`. Each `forge create` broadcasts a transaction and may request a keystore password. The helper records addresses and receipts under ignored `deployments/`. It stops on errors; this is a sequence of transactions, not an atomic batch. After a partial failure, inspect the saved receipts and resume from the failed step rather than recreating the entire deployment.

```bash
set -euo pipefail
mkdir -p ../deployments/"$CHAIN_ID"
NET=(--rpc-url "$RPC_URL" --chain "$CHAIN_ID" --legacy --gas-price 0)
OUT="../deployments/$CHAIN_ID"

deploy() {
  local label="$1" contract="$2"; shift 2
  forge create "$contract" "${NET[@]}" --account atlas-admin --broadcast --json \
    --constructor-args "$@" > "$OUT/$label.json"
  jq -er '.deployedTo' "$OUT/$label.json"
}
# No-argument constructor: omit --constructor-args entirely.
forge create src/MockEUR.sol:MockEUR "${NET[@]}" --account atlas-admin --broadcast --json > "$OUT/payment.json"
PAYMENT=$(jq -er '.deployedTo' "$OUT/payment.json")
REGISTRY=$(deploy registry src/IdentityRegistry.sol:IdentityRegistry "$ADMIN" "$OFFICER")
POLICY=$(deploy compliance src/Compliance.sol:Compliance "$ADMIN" "$OFFICER")
JURISDICTION=$(deploy jurisdiction src/Compliance.sol:JurisdictionRule "$REGISTRY" '[276,250,528]')
HOLDING=$(deploy holding src/Compliance.sol:HoldingLimitRule 10000)
CONCENTRATION=$(deploy concentration src/Compliance.sol:ConcentrationRule 10000 6000)
LOCKUP=$(deploy lockup src/Compliance.sol:LockupRule 0)
FACTORY=$(deploy factory src/AssetFactory.sol:AssetFactory "$ADMIN" "$ISSUER")
cast send "$POLICY" 'setRules(address[])' "[$JURISDICTION,$HOLDING,$CONCENTRATION,$LOCKUP]" \
  "${NET[@]}" --account atlas-officer --json > "$OUT/set-rules.json"
ASSET_ID=$(cast keccak 'ATLAS-2030-BESU')
cast send "$FACTORY" 'create(bytes32,string,string,uint256,address,address,(address,address,address,address))' \
  "$ASSET_ID" 'Atlas Synthetic Bond 2030' 'ATLAS2030' 10000 "$REGISTRY" "$POLICY" \
  "($ADMIN,$ISSUER,$OFFICER,$AGENT)" "${NET[@]}" --account atlas-issuer --json > "$OUT/create-asset.json"
TOKEN=$(cast call "$FACTORY" 'assets(bytes32)(address)' "$ASSET_ID" --rpc-url "$RPC_URL")
# 2030-12-31 00:00 UTC; choose a future maturity if running this later.
OFFERING=$(deploy offering src/BondOffering.sol:BondOffering "$TOKEN" "$PAYMENT" "$ADMIN" "$ISSUER" "$OFFICER" "$TREASURY" 1000000000 1924905600)
DVP=$(deploy dvp src/DvP.sol:DvP "$TOKEN" "$PAYMENT")
ACTIONS=$(deploy actions src/CorporateActions.sol:CorporateActions "$OFFERING" "$ADMIN" "$AGENT")
ISSUER_ROLE=$(cast call "$TOKEN" 'ISSUER_ROLE()(bytes32)' --rpc-url "$RPC_URL")
REDEEMER_ROLE=$(cast call "$TOKEN" 'REDEEMER_ROLE()(bytes32)' --rpc-url "$RPC_URL")
cast send "$TOKEN" 'grantRole(bytes32,address)' "$ISSUER_ROLE" "$OFFERING" "${NET[@]}" --account atlas-admin --json > "$OUT/grant-issuer.json"
cast send "$TOKEN" 'revokeRole(bytes32,address)' "$ISSUER_ROLE" "$ISSUER" "${NET[@]}" --account atlas-admin --json > "$OUT/revoke-issuer.json"
cast send "$TOKEN" 'grantRole(bytes32,address)' "$REDEEMER_ROLE" "$ACTIONS" "${NET[@]}" --account atlas-admin --json > "$OUT/grant-redeemer.json"
cast send "$REGISTRY" 'setRequiredTopics(uint256[])' '[1]' "${NET[@]}" --account atlas-officer --json > "$OUT/topics.json"
cast send "$REGISTRY" 'setTrustedIssuer(address,uint256,bool)' "$ATTESTER" 1 true "${NET[@]}" --account atlas-officer --json > "$OUT/trusted-issuer.json"
jq -n --argjson chainId "$CHAIN_ID" --arg registry "$REGISTRY" --arg compliance "$POLICY" \
  --arg factory "$FACTORY" --arg token "$TOKEN" --arg payment "$PAYMENT" --arg offering "$OFFERING" \
  --arg dvp "$DVP" --arg actions "$ACTIONS" --arg admin "$ADMIN" --arg issuer "$ISSUER" \
  --arg officer "$OFFICER" --arg agent "$AGENT" --arg attester "$ATTESTER" --arg treasury "$TREASURY" \
  '{chainId:$chainId,contracts:{registry:$registry,compliance:$compliance,factory:$factory,token:$token,payment:$payment,offering:$offering,dvp:$dvp,actions:$actions},roles:{admin:$admin,issuer:$issuer,officer:$officer,agent:$agent,attester:$attester,treasury:$treasury}}' > "$OUT/manifest.json"
```

MockEUR has an unrestricted synthetic faucet. Substitute an explicitly reviewed settlement asset and its decimals/price semantics for another use case. The code uses whole security units and six-decimal mock EUR; 1,000 EUR is `1000000000` payment units. These commands leave the offering in Draft and mint no bonds. Register and attest investors before issuer/approver lifecycle actions; use the existing bond walkthrough and contract ABIs. Do not call Anvil timestamp-warp methods on Besu to simulate maturity.

## 4. Verify and preserve evidence

```bash
cast code "$TOKEN" --rpc-url "$RPC_URL"
cast call "$TOKEN" 'totalSupply()(uint256)' --rpc-url "$RPC_URL" # expected 0
cast call "$TOKEN" 'hasRole(bytes32,address)(bool)' "$ISSUER_ROLE" "$OFFERING" --rpc-url "$RPC_URL" # true
cast call "$TOKEN" 'hasRole(bytes32,address)(bool)' "$ISSUER_ROLE" "$ISSUER" --rpc-url "$RPC_URL" # false
cast call "$TOKEN" 'hasRole(bytes32,address)(bool)' "$REDEEMER_ROLE" "$ACTIONS" --rpc-url "$RPC_URL" # true
cast call "$OFFERING" 'state()(uint8)' --rpc-url "$RPC_URL" # 0 / Draft
cast call "$REGISTRY" 'isVerified(address)(bool)' "$TREASURY" --rpc-url "$RPC_URL" # false before registration
```

Check receipt status, block number/hash and deployed code for every saved transaction. Record repository commit, compiler 0.8.30, Paris target, optimizer 200, constructor arguments, role assignments, genesis hash, client/image versions and chain ID. Archive deployment receipts outside Git or selectively publish sanitized records. For a private explorer, submit Standard JSON compiler input and exact constructor arguments using its supported verification API; a public Etherscan endpoint is not automatically available for a private Besu network.

## 5. Dashboard, indexer and bridge constraints

The current Atlas SDK enforces chain ID 31337 and consumes the demo's manifest schema. The deployment record above is an operator inventory, not a drop-in dashboard manifest. Pointing `RPC_URL` at Besu alone does not migrate the application. A dashboard integration requires an explicit allowed-chain configuration change, a matching SDK manifest with deployment/start blocks, a separate PostgreSQL database, reindexing, wallet chain configuration, and transaction/reconciliation testing. Do not relabel a Besu chain as 31337 to bypass the guard. The `npm run demo` and `demo:redeem` commands remain Anvil-only.

The standard zkEVM bridge does not automatically preserve Atlas identity, jurisdiction, freeze, recovery or coupon checkpoint semantics. Do not bridge this security token through a generic ERC-20 wrapper. A reviewed cross-chain design must enforce identity and compliance on both chains, define custody and supply conservation, synchronize corporate-action entitlements, and address finality/bridge failures. DvP here is atomic only within the same chain. Test connectivity first with disposable synthetic assets. Never reuse this devnet's validator/test keys or mock prover as production infrastructure.

## Sources

- [Besu developer quickstart](https://docs.besu-eth.org/private-networks/tutorials/quickstart/)
- [CDK Besu integration and supported consensus](https://0xpolygon.github.io/kurtosis-cdk/configuration/examples/cdk-besu/)
- [Pinned upstream Besu configuration](https://github.com/0xPolygon/kurtosis-cdk/blob/ed8fac443ff48b6ad243e449d514bcef716c2bd5/.github/tests/besu/sovereign-ecdsa-multisig.yml)
- [Kurtosis CDK repository](https://github.com/0xPolygon/kurtosis-cdk)
- [Polygon zkEVM sunset announcement](https://forum.polygon.technology/t/polygon-zkevm-mainnet-beta-sunset-claim-your-funds/21856)
