#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p work
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM
if curl --max-time 1 -s http://127.0.0.1:8545 >/dev/null; then
  echo 'Port 8545 is already in use. Stop the previous local chain before starting a fresh demo.' >&2
  exit 1
fi
(cd contracts && forge build)
anvil --host 127.0.0.1 --chain-id 31337 --timestamp 1791504000 --silent >work/anvil.log 2>&1 &
pids+=("$!")
for attempt in {1..50}; do
  if curl --max-time 1 -sf -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null; then break; fi
  sleep 0.2
done
npm run demo
ATLAS_DB_PATH="work/postgres-$(date +%s)" npm run api >work/api.log 2>&1 &
pids+=("$!")
npm run build:web
npx next start apps/web --hostname 127.0.0.1 --port 3000 &
pids+=("$!")
echo 'Atlas terminal: http://127.0.0.1:3000 — run npm run demo:redeem in another terminal to simulate maturity.'
wait
