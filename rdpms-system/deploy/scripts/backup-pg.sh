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

# ── 3) uploads 备份（硬链快照 + rsync）────────────────────
SNAP="$UP_DIR/$TS"
if [ -d "$UP_DIR/latest" ]; then
  sudo cp -al "$UP_DIR/latest" "$SNAP" 2>/dev/null || sudo mkdir -p "$SNAP"
else
  sudo mkdir -p "$SNAP"
fi
sudo rsync -a --delete "$UPLOAD_SRC/" "$SNAP/"
sudo ln -sfn "$SNAP" "$UP_DIR/latest"
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
