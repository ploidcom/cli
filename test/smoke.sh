#!/usr/bin/env bash
# Manual end-to-end smoke test against the fake server in smoke-server.mjs.
# Not run in CI; useful for local verification of the full command path.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT_FILE="$(mktemp)"
node test/smoke-server.mjs >"$PORT_FILE" 2>/tmp/ploid_smoke_srv.log &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT

# Wait for the server to print its port.
for _ in $(seq 1 50); do
  PORT="$(head -1 "$PORT_FILE" 2>/dev/null || true)"
  [ -n "$PORT" ] && break
  sleep 0.1
done
echo "server on port $PORT"

export PLOID_API_KEY=pk_smoke
export PLOID_API_BASE_URL="http://localhost:$PORT"

echo "=== auth check ==="
node dist/cli.js auth check

echo "=== people lookup --json ==="
node dist/cli.js --json people lookup --name "Jane Doe" --company Acme

echo "=== linkedin call --json ==="
node dist/cli.js --json linkedin call profile url=https://li/in/x

echo "=== batch create --wait ==="
printf '[{"identifier":"github:octocat"}]' | node dist/cli.js batch create --fields github --wait

echo "=== openapi (first line) ==="
node dist/cli.js openapi | head -c 120; echo

echo "=== error path (expect exit 2) ==="
set +e
node dist/cli.js searches get nope
echo "exit=$?"
set -e

echo "ALL SMOKE CHECKS DONE"
