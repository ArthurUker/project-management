#!/usr/bin/env bash
# Complete immutable pair publication only. Consistent restore eligibility is separate RP19.
# No sourcing real dotenv; production PostgreSQL uses local postgres peer.
# Install backup-pair.py beside this wrapper, retain both at identical reviewed version.
set -Eeuo pipefail
umask 077
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
command -v python3 >/dev/null || { printf 'backup requires python3\n' >&2; exit 1; }
exec python3 "$SCRIPT_DIR/backup-pair.py" "${1:-${KIND:-daily}}"
