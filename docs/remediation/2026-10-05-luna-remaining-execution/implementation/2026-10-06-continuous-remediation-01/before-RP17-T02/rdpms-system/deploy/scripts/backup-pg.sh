#!/usr/bin/env bash
#
# backup-pg.sh — RDPMS 备份（P0 硬要求）
#
# 总控裁定落实：
#   #7  RPO <= 24h / RTO <= 4h；WAL/PITR 为 P1 增强，不在本脚本内
#   #20 使用 postgres 本地 peer 备份，不读取含密码的 DIRECT_URL
#   #10 备份日志保留 180 天；pg_dump 日 30 / 周 12 / 月 12
#   #6  异地同步为 P1；未配置则 WARN，不阻断
#
# 用法：
#   sudo /usr/local/bin/rdpms-backup.sh daily
#   sudo /usr/local/bin/rdpms-backup.sh predeploy
#   KIND=weekly  sudo /usr/local/bin/rdpms-backup.sh
#
# 注意：
#   数据库备份不包含 /srv/rdpms/uploads（文件二进制不入库），两者必须同频率备份。
#
set -Eeuo pipefail

# 支持同机 staging：
#   sudo env DB_NAME=rdpms_staging \
#            UPLOAD_SRC=/srv/rdpms/uploads-staging \
#            UP_DIR=/srv/rdpms/backups/uploads-staging \
#            /usr/local/bin/rdpms-backup.sh daily
KIND="${1:-${KIND:-daily}}"
DB_NAME="${DB_NAME:-rdpms}"
PG_DIR="${PG_DIR:-/srv/rdpms/backups/pg}"
UP_DIR="${UP_DIR:-/srv/rdpms/backups/uploads}"
UPLOAD_SRC="${UPLOAD_SRC:-/srv/rdpms/uploads}"
LOG="${LOG:-/var/log/rdpms/backup.log}"
KEEP_DAILY="${KEEP_DAILY:-30}"
KEEP_WEEKLY="${KEEP_WEEKLY:-84}"
KEEP_MONTHLY="${KEEP_MONTHLY:-365}"
KEEP_UPLOADS="${KEEP_UPLOADS:-30}"

case "$KIND" in
  daily|weekly|monthly|predeploy) ;;
  *) printf '[backup] 未知 KIND=%s（可选 daily|weekly|monthly|predeploy）\n' "$KIND" >&2; exit 2 ;;
esac

mkdir -p "$PG_DIR/$KIND" "$UP_DIR" "$(dirname "$LOG")"
log() { printf '%s [%s][%s] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$KIND" "$DB_NAME" "$*" | tee -a "$LOG"; }
fail() { printf '%s [%s][%s][FATAL] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$KIND" "$DB_NAME" "$*" | tee -a "$LOG" >&2; exit 1; }

command -v pg_dump   >/dev/null 2>&1 || fail "未找到 pg_dump"
command -v pg_restore >/dev/null 2>&1 || fail "未找到 pg_restore"
command -v rsync     >/dev/null 2>&1 || fail "未找到 rsync"

TS="$(date +%Y%m%d-%H%M%S)"
STAGING=""
cleanup_staging() {
  if [ -n "$STAGING" ] && [ -d "$STAGING" ]; then
    sudo rm -rf "$STAGING"
  fi
}
trap cleanup_staging EXIT

# ── 1) 数据库逻辑备份 ─────────────────────────────────────
# 文件名带库名，staging / production 备份可共存于同一目录
DUMP="$PG_DIR/$KIND/${DB_NAME}-$TS.dump"
umask 077
if ! sudo -u postgres pg_dump -Fc -Z 6 -d "$DB_NAME" -f "$DUMP"; then
  fail "pg_dump 失败"
fi
log "dump 完成: $DUMP ($(du -h "$DUMP" | cut -f1))"

# ── 2) 立即可恢复性校验 ───────────────────────────────────
if ! sudo -u postgres pg_restore -l "$DUMP" >/dev/null 2>&1; then
  fail "dump 不可读，备份无效"
fi
sha256sum "$DUMP" | sudo tee "$DUMP.sha256" >/dev/null
log "dump 校验通过（pg_restore -l OK，已生成 sha256）"

# ── 3) uploads 备份（staging → manifest → 同FS原子发布）────────
SNAP="$UP_DIR/$TS"
if [ -e "$SNAP" ] || [ -L "$SNAP" ]; then
  fail "uploads 快照目标已存在（时间戳冲突），拒绝覆盖: $SNAP"
fi
UP_DIR_REAL="$(cd "$UP_DIR" && pwd -P)"
if [ -L "$UP_DIR/latest" ]; then
  LINK_TARGET="$(readlink "$UP_DIR/latest" 2>/dev/null || true)"
  case "$LINK_TARGET" in
    /*) PREVIOUS_CANDIDATE="$LINK_TARGET" ;;
    *) PREVIOUS_CANDIDATE="$UP_DIR/$LINK_TARGET" ;;
  esac
  PREVIOUS="$(cd "$PREVIOUS_CANDIDATE" 2>/dev/null && pwd -P || true)"
  [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] || fail "latest 指向的快照不存在或不是目录"
  case "$PREVIOUS" in
    "$UP_DIR_REAL"/*) ;;
    *) fail "latest 指向 UP_DIR 之外，拒绝用作 link-dest: $PREVIOUS" ;;
  esac
elif [ -e "$UP_DIR/latest" ]; then
  fail "latest 存在但不是软链接，拒绝覆盖"
else
  PREVIOUS=""
fi

# staging 位于 UP_DIR 内，确保最终目录改名和 latest 软链替换都发生在同一文件系统。
STAGING="$(sudo mktemp -d "$UP_DIR/.staging-$TS.XXXXXX")"
if [ -n "$PREVIOUS" ]; then
  sudo rsync -a --delete --link-dest="$PREVIOUS" "$UPLOAD_SRC/" "$STAGING/"
else
  sudo rsync -a --delete "$UPLOAD_SRC/" "$STAGING/"
fi

# Reserved metadata filename; refuse a source collision instead of silently replacing user data.
MANIFEST_NAME=".rdpms-snapshot-manifest.sha256"
if [ -e "$STAGING/$MANIFEST_NAME" ]; then
  fail "uploads 源包含保留清单名 $MANIFEST_NAME，拒绝覆盖"
fi
sudo bash -c 'cd "$1" && find . -type f ! -name "$2" -print0 | sort -z | xargs -0 -r sha256sum > "$1/$2"' _ "$STAGING" "$MANIFEST_NAME"
sudo test -f "$STAGING/$MANIFEST_NAME" || fail "uploads 文件清单未生成"

# Rename staged snapshot only after rsync and manifest succeed. Existing published data is immutable.
sudo mv -T "$STAGING" "$SNAP"
STAGING=""
LATEST_TMP="$UP_DIR/.latest-$TS-$$"
sudo ln -s "$SNAP" "$LATEST_TMP"
if ! sudo mv -Tf "$LATEST_TMP" "$UP_DIR/latest"; then
  sudo rm -f -- "$LATEST_TMP"
  fail "快照已发布但 latest 原子更新失败；保留已发布快照和原 latest"
fi
log "uploads 备份完成: $SNAP"

# ── 4) 保留策略 ──────────────────────────────────────────
find "$PG_DIR/daily"   -name '*.dump*' -mtime "+${KEEP_DAILY}"   -delete 2>/dev/null || true
find "$PG_DIR/weekly"  -name '*.dump*' -mtime "+${KEEP_WEEKLY}"  -delete 2>/dev/null || true
find "$PG_DIR/monthly" -name '*.dump*' -mtime "+${KEEP_MONTHLY}" -delete 2>/dev/null || true
find "$UP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+${KEEP_UPLOADS}" -exec rm -rf {} + 2>/dev/null || true
log "保留策略已执行（日 ${KEEP_DAILY} / 周 ${KEEP_WEEKLY} / 月 ${KEEP_MONTHLY} / uploads ${KEEP_UPLOADS} 天）"

# ── 5) 异地同步（P1 增强，未配置仅 WARN）───────────────────
if [ -n "${COS_TARGET:-}" ] && command -v coscli >/dev/null 2>&1; then
  if coscli sync "$PG_DIR/$KIND" "$COS_TARGET/pg/$KIND/" \
     && coscli sync "$SNAP" "$COS_TARGET/uploads/$TS/"; then
    log "异地同步完成 -> $COS_TARGET"
  else
    log "WARN 异地同步失败（本地备份仍然有效）"
  fi
else
  log "WARN 未配置异地同步，备份仅存本地（同机风险；正式生产必须配置 COS_TARGET）"
fi

log "备份流程结束"
