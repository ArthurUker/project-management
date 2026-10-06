#!/usr/bin/env bash
# Host inspection and candidate config are distinct. No DB/DDL/source heuristics on current.
set -Eeuo pipefail
case "${1:-}" in
 --host)
  command -v node >/dev/null
  command -v python3 >/dev/null
  command -v pg_dump >/dev/null
  command -v pg_restore >/dev/null
  printf 'HOST_TOOLS_PRESENT; target proxy/mount/ownership/release gates still required\n'
  ;;
 --candidate)
  CANDIDATE_ROOT="${2:?explicit candidate required}"
  CANDIDATE_ENV_FILE="${3:?explicit config file required}"
  test -f "$CANDIDATE_ROOT/rdpms-system/backend/dist/index.js"
  test -f "$CANDIDATE_ROOT/rdpms-system/frontend/dist/index.html"
  exec node "$CANDIDATE_ROOT/rdpms-system/backend/dist/platform/config/configCli.js" --env-file "$CANDIDATE_ENV_FILE" --code-root "$CANDIDATE_ROOT/rdpms-system/backend"
  ;;
 *) printf 'Use --host or --candidate <explicit root> <explicit env file>; current cannot substitute candidate\n' >&2; exit 2 ;;
esac
