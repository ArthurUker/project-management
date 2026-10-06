#!/usr/bin/env bash
set -Eeuo pipefail
repo_root="$(cd "$(dirname "$0")/../../../../../../.." && pwd)"
backup_script="$repo_root/rdpms-system/deploy/scripts/backup-pg.sh"
original_path="$PATH"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/rdpms-rp17t01.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/source" "$tmp/pg" "$tmp/uploads"

cat > "$tmp/bin/sudo" <<'SUDO'
#!/usr/bin/env bash
set -e
if [[ "${1:-}" == "-u" ]]; then shift 2; fi
case "${1:-}" in
  tee) shift; exec /usr/bin/tee "$@" ;;
  mv)
    shift
    while [[ "${1:-}" == -* ]]; do shift; done
    source_path="$1"; target_path="$2"
    exec python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$source_path" "$target_path"
    ;;
  *) exec "$@" ;;
esac
SUDO
cat > "$tmp/bin/pg_dump" <<'DUMP'
#!/usr/bin/env bash
set -e
while (($#)); do
  if [[ "$1" == "-f" ]]; then shift; printf 'synthetic dump only; no database connection\n' > "$1"; exit 0; fi
  shift
done
exit 2
DUMP
cat > "$tmp/bin/pg_restore" <<'RESTORE'
#!/usr/bin/env bash
[[ "${1:-}" == "-l" && -f "${2:-}" ]]
RESTORE
cat > "$tmp/bin/rsync" <<'RSYNC'
#!/usr/bin/env bash
if [[ "${FAIL_RSYNC:-0}" == 1 ]]; then exit 23; fi
exec /usr/bin/rsync "$@"
RSYNC
chmod +x "$tmp/bin/"*
printf 'first version\n' > "$tmp/source/change.txt"
printf 'preserve this\n' > "$tmp/source/remove.txt"
printf 'unchanged bytes\n' > "$tmp/source/stable.txt"
run_backup() {
  PATH="$tmp/bin:$original_path" \
  UPLOAD_SRC="$tmp/source" UP_DIR="$tmp/uploads" PG_DIR="$tmp/pg" \
  LOG="$tmp/backup.log" DB_NAME=rdpms_test_rp17 \
  bash "$backup_script" daily
}
run_backup > "$tmp/run1.log" 2>&1
first="$(cd "$tmp/uploads/latest" && pwd -P)"
first_manifest_hash="$(shasum -a 256 "$first/.rdpms-snapshot-manifest.sha256" | awk '{print $1}')"
first_bytes="$(cat "$first/change.txt")"
first_stable_inode="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_ino)' "$first/stable.txt")"
(cd "$first" && sha256sum -c .rdpms-snapshot-manifest.sha256) > "$tmp/manifest-check.log"
rm "$tmp/source/remove.txt"
printf 'second version\n' > "$tmp/source/change.txt"
printf 'new file\n' > "$tmp/source/add.txt"
sleep 1.1
if ! run_backup > "$tmp/run2.log" 2>&1; then cat "$tmp/run2.log" >&2; exit 1; fi
second="$(cd "$tmp/uploads/latest" && pwd -P)"
[[ "$first" != "$second" ]]
[[ "$(cat "$first/change.txt")" == "$first_bytes" ]]
[[ ! -e "$second/remove.txt" && -e "$second/add.txt" ]]
[[ "$(shasum -a 256 "$first/.rdpms-snapshot-manifest.sha256" | awk '{print $1}')" == "$first_manifest_hash" ]]
second_stable_inode="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_ino)' "$second/stable.txt")"
[[ "$first_stable_inode" == "$second_stable_inode" ]]
second_link="$(readlink "$tmp/uploads/latest")"
printf 'failed attempt\n' > "$tmp/source/fail.txt"
sleep 1.1
set +e
PATH="$tmp/bin:$original_path" FAIL_RSYNC=1 \
UPLOAD_SRC="$tmp/source" UP_DIR="$tmp/uploads" PG_DIR="$tmp/pg" \
LOG="$tmp/backup.log" DB_NAME=rdpms_test_rp17 bash "$backup_script" daily > "$tmp/failure.log" 2>&1
failure_status=$?
set -e
[[ "$failure_status" -ne 0 ]]
[[ "$(readlink "$tmp/uploads/latest")" == "$second_link" ]]
[[ "$(cat "$first/change.txt")" == "$first_bytes" ]]
if find "$tmp/uploads" -maxdepth 1 -type d -name '.staging-*' | grep -q .; then
  echo 'staging directory leaked after injected failure' >&2
  exit 1
fi
cat <<EOF
PASS first snapshot manifest verifies
PASS second snapshot published after two add/change/delete rounds
PASS first snapshot file bytes and manifest remain unchanged
PASS unchanged file retains hard-link inode across snapshots
PASS injected rsync failure exit=$failure_status leaves latest unchanged and cleans staging
PASS synthetic pg_dump/pg_restore stubs used; no PostgreSQL client or database was contacted
EOF
