#!/usr/bin/env bash
# Only reviewed compiled current artifacts. Missing dist/manifest is a hard failure.
# Legacy src fallback can activate known unsafe code and is intentionally unavailable.
set -Eeuo pipefail
CURRENT_ROOT="${RDPMS_CURRENT_ROOT:-/opt/rdpms/current}"
APP_DIR="$CURRENT_ROOT/rdpms-system/backend"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
ENV_FILE="${RDPMS_ENV_FILE:-/srv/rdpms/.env}"
MANIFEST="$CURRENT_ROOT/.rdpms-release-manifest.json"
test -d "$APP_DIR"
test -x "$NODE_BIN"
test -f "$APP_DIR/dist/index.js"
test -f "$MANIFEST"
RDPMS_BUILD_ID="$(python3 "$CURRENT_ROOT/rdpms-system/deploy/scripts/deploy-control.py" --verify-current "$MANIFEST" --env-file "$ENV_FILE")"
export RDPMS_BUILD_ID
cd "$APP_DIR"
# Validate actual systemd environment with the same schema; no DB/network/values printed.
"$NODE_BIN" "$APP_DIR/dist/platform/config/configCli.js" --compare-manifest "$MANIFEST" >/dev/null
exec "$NODE_BIN" "$APP_DIR/dist/index.js"
