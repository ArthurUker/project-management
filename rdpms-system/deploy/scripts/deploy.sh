#!/usr/bin/env bash
# Explicit isolated candidate preparation only at RP18-T01. Operational cutover is RP18-T02.
# No git/npm install/DDL or current/service operations in this preparation stage.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
case "${1:-}" in
 --prepare)
  shift
  exec python3 "$SCRIPT_DIR/candidate-gate.py" "$@"
  ;;
 --apply)
  shift
  exec python3 "$SCRIPT_DIR/deploy-control.py" "$@"
  ;;
 *) printf 'Use --prepare or explicit gated --apply; target approval/proofs required, no automatic fetch/install/deploy.\n' >&2; exit 2 ;;
esac
