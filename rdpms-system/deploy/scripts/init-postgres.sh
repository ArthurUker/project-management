#!/usr/bin/env bash
#
# init-postgres.sh — RDPMS PostgreSQL 初始化（幂等，可重复执行）
#
# 总控裁定落实：
#   #13  不安装 pg_trgm
#   #14  不强制 pgcrypto；仅当 migration.sql 出现 gen_random_uuid() 时才安装
#   #18  校验 SQL 使用 snake_case 表名（users / projects / audit_logs）
#
# 安全约束：
#   1. 密码只写入 600 的 secrets 文件，绝不打印到终端或日志；
#   2. 已存在的数据库绝不 drop；
#   3. 需要 sudo 免密或 root 执行。
#
# 用法：
#   sudo bash deploy/scripts/init-postgres.sh
#
set -Eeuo pipefail

DB_NAME="${DB_NAME:-rdpms}"
MIGRATE_ROLE="${MIGRATE_ROLE:-rdpms_migrate}"
APP_ROLE="${APP_ROLE:-rdpms_app}"
SECRETS_FILE="${SECRETS_FILE:-/root/.rdpms-pg-secrets}"
MIG_DIR="${MIG_DIR:-/opt/rdpms/current/rdpms-system/backend/prisma/migrations}"
PG_VERSION="${PG_VERSION:-16}"

log() { printf '[init-pg] %s\n' "$*"; }
die() { printf '[init-pg][FATAL] %s\n' "$*" >&2; exit 1; }

command -v psql >/dev/null 2>&1 || die "未找到 psql，请先安装 postgresql-client-${PG_VERSION}"

# ── Step 0 等待 PostgreSQL 就绪 ────────────────────────────
ready=0
for i in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || die "PostgreSQL 30 秒内未就绪"
log "PostgreSQL 已就绪"

# ── Step 1 密码（幂等：已存在则复用）────────────────────────
if [ ! -f "$SECRETS_FILE" ]; then
  log "生成角色密码 -> ${SECRETS_FILE} (600)"
  umask 077
  printf 'MIGRATE_PASSWORD=%s\nAPP_PASSWORD=%s\n' \
    "$(openssl rand -base64 32 | tr -d '\n')" \
    "$(openssl rand -base64 32 | tr -d '\n')" > "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
else
  log "复用已有密码文件（幂等）"
fi

set -a
# shellcheck disable=SC1090
source "$SECRETS_FILE"
set +a
MIG_PW="${MIGRATE_PASSWORD:?secrets 文件缺少 MIGRATE_PASSWORD}"
APP_PW="${APP_PASSWORD:?secrets 文件缺少 APP_PASSWORD}"

# ── Step 2 角色（幂等）─────────────────────────────────────
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${MIGRATE_ROLE}') THEN
    CREATE ROLE ${MIGRATE_ROLE} LOGIN PASSWORD '${MIG_PW}';
  ELSE
    ALTER ROLE ${MIGRATE_ROLE} LOGIN PASSWORD '${MIG_PW}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
    CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}';
  ELSE
    ALTER ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}';
  END IF;
END
\$\$;
SQL
log "角色 ${MIGRATE_ROLE} / ${APP_ROLE} 就绪"

# ── Step 3 建库（存在则跳过，绝不 drop）─────────────────────
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  log "数据库 ${DB_NAME} 已存在，跳过创建（生产库不会被 drop）"
else
# 说明：LC_COLLATE/LC_CTYPE 使用 'C'（保守选择，排序稳定且与 libc 无关）。
#   影响：中文排序为二进制/Unicode 序，非拼音序。
#   如需中文自然排序，需独立评估 ICU collation（重建库，属破坏性变更）。
#   总控验收文档须记录此项。
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${MIGRATE_ROLE} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';"
  log "已创建空库 ${DB_NAME}（owner=${MIGRATE_ROLE}, LC_COLLATE=C）"
fi

# ── Step 4 权限与默认权限 ──────────────────────────────────
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<SQL
GRANT CONNECT ON DATABASE ${DB_NAME} TO ${APP_ROLE};
GRANT USAGE  ON SCHEMA public TO ${APP_ROLE};
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- PG14 下 public schema 属主是 postgres 超级用户；REVOKE PUBLIC 的 CREATE 后
-- migrate 角色（DDL 执行者）必须有建表权 → 将 public schema 归属库 owner（W12 实测修复）
ALTER SCHEMA public OWNER TO ${MIGRATE_ROLE};

ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATE_ROLE} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};
ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATE_ROLE} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE};
SQL
log "已授予 ${APP_ROLE}：CONNECT / USAGE / DML（无 DDL）"

# ── Step 5 扩展（总控裁定 #13 / #14）───────────────────────
log "扩展策略：pg_trgm 不安装（总控裁定 #13）；pgcrypto 不强制（总控裁定 #14）"
log "期望：migrations 中 gen_random_uuid 命中数为 0（ID 由 Prisma uuid() 生成）"
if [ -d "$MIG_DIR" ] && grep -rqi 'gen_random_uuid' "$MIG_DIR"; then
  log "WARN 检测到 migration 使用 gen_random_uuid() —— 与 DB 窗口修订后的约定不符"
  log "WARN 请与 DB 窗口确认是否为预期；为保证迁移可成功，此处仍安装 pgcrypto"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
    -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
  log "已安装 pgcrypto（条件安装，非默认）"
else
  log "gen_random_uuid 命中数为 0，跳过 pgcrypto —— 符合裁定"
fi

# ── Step 6 连通性自检 ─────────────────────────────────────
PGPASSWORD="$MIG_PW" psql -h 127.0.0.1 -U "$MIGRATE_ROLE" -d "$DB_NAME" -tAc 'SELECT 1;' >/dev/null \
  && log "migrate 角色连通 OK" || die "migrate 角色连通失败"
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$APP_ROLE" -d "$DB_NAME" -tAc 'SELECT 1;' >/dev/null \
  && log "app 角色连通 OK" || die "app 角色连通失败"

cat <<EOF

[init-pg] 完成。后续步骤：
  1) 从 ${SECRETS_FILE} 取密码写入 /srv/rdpms/.env：
       DATABASE_URL="postgresql://${APP_ROLE}:<APP_PASSWORD>@127.0.0.1:5432/${DB_NAME}?schema=public&connection_limit=10&pool_timeout=20"
       DIRECT_URL="postgresql://${MIGRATE_ROLE}:<MIGRATE_PASSWORD>@127.0.0.1:5432/${DB_NAME}?schema=public"
  2) sudo bash deploy/scripts/preflight.sh
  3) cd /opt/rdpms/current/rdpms-system/backend && sudo -u rdpms env HOME=/var/lib/rdpms /usr/local/bin/rdpms-env npx prisma migrate deploy

EOF
