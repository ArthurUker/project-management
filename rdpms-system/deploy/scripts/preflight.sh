#!/usr/bin/env bash
#
# preflight.sh — 部署/启动前置校验（fail-fast）
#
# 总控裁定落实：
#   #15 路径统一为 /opt/rdpms/current/rdpms-system/...
#   #17 .env = root:rdpms 640，rdpms 可读不可写
#   #19 生产 SEED_TEST_ACCOUNTS 必须为 false
#   #2  TRUST_PROXY_HOPS 与拓扑匹配（1 或 2）
#
# 安全约束：本脚本读取 .env 但绝不打印任何值。
#
# 用法：
#   sudo bash deploy/scripts/preflight.sh
#   exit 0 = 全部通过；exit 1 = 存在失败项
#
# 反向代理模式（端口探测结果确定后设置）：
#   RDPMS_PROXY_MODE=nginx80      Nginx 独占 80
#   RDPMS_PROXY_MODE=caddy_domain Caddy 域名站点（推荐正式方案）
#   RDPMS_PROXY_MODE=caddy_8081   Caddy 临时高端口（临时联调，非生产标准）
#   RDPMS_PROXY_MODE=none         仅本地开发，production 下拒绝
#   PREFLIGHT_STRICT=0            代理项仅警告（当前阶段）
#   PREFLIGHT_STRICT=1            代理项计入失败并阻断（生产发布前必须切换）
#
# 示例：
#   sudo env RDPMS_PROXY_MODE=caddy_domain PREFLIGHT_STRICT=1 \
#        bash /usr/local/bin/rdpms-preflight.sh
#
# 契约门禁覆盖：schema 禁项 / schema 必须项 / migration 禁项 /
#               seed 禁项（含 AuditAction 清单）/ 后端禁项 / 前端禁项 /
#               权限 SQL 契约（预留不执行）
#
# 权限 SQL 契约（M-1 v1.0 冻结值，OPS 只校验不定义）：
#   permissions = 90（P0；P1=30 不进 seed）
#   SUPER_ADMIN = 90 / ADMIN = 80（90 - 10 排除项 = 8 高危 + audit.export + system.logs.view）/ AUDITOR = 3
#   MANAGER = 66 / MEMBER = 31 / VIEWER = 19；RolePermission 总数 = 289
#   audit.view       : SUPER_ADMIN + ADMIN + AUDITOR
#   audit.export     : SUPER_ADMIN + AUDITOR（ADMIN 不持有）
#   system.logs.view : SUPER_ADMIN + AUDITOR
#   users.delete     : 仅 SUPER_ADMIN
#   reagents.export  : P0 唯一试剂导出出口；reagent_materials.export 为 P1 不入库
#   permissions.code : resource.action 命名空间，不得含 elevated / override
#   audit_logs.metadata + GIN 索引
#
# M-1 v1.0 已冻结。OPS 窗口不修改任何权限码、默认角色、sortOrder、
# P0/P1/否决归属；如需变更须提交 M-1 v1.1 变更申请。
#
# 说明：本脚本只读，不修改任何文件，默认不访问数据库。
#       唯一会访问数据库的分支是 RUN_SQL_CONTRACT=1（人工显式触发）。
#
# 可选环境变量：
#   PERMISSIONS_EXPECTED=90                权限总数期望
#   AUDIT_ACTIONS_EXPECTED='a,b,c'         AuditLog.action 清单（BE/DB 提供）
#   DB_CONTRACT=rdpms|rdpms_staging        SQL 契约目标库
#
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-/srv/rdpms/.env}"
APP_DIR="${APP_DIR:-/opt/rdpms/current/rdpms-system/backend}"
WEB_DIR="${WEB_DIR:-/opt/rdpms/current/rdpms-system/frontend}"
UPLOAD_DIR_EXPECT="${UPLOAD_DIR_EXPECT:-/srv/rdpms/uploads}"

# 契约门禁目标（仓库根：已核实含 rdpms-system/ 子目录）
REPO_ROOT="${REPO_ROOT:-/opt/rdpms/current}"
SCHEMA="${REPO_ROOT}/rdpms-system/backend/prisma/schema.prisma"
MIG_DIR="${REPO_ROOT}/rdpms-system/backend/prisma/migrations"
SEED_JS="${REPO_ROOT}/rdpms-system/backend/prisma/seed.js"
BE_SRC="${REPO_ROOT}/rdpms-system/backend/src"
FE_SRC="${REPO_ROOT}/rdpms-system/frontend/src"

# 必须导出：下方 chk 通过 `bash -c` 执行，子 shell 依赖环境变量传递
export ENV_FILE APP_DIR WEB_DIR UPLOAD_DIR_EXPECT \
       REPO_ROOT SCHEMA MIG_DIR SEED_JS BE_SRC FE_SRC

PASS=0
FAIL=0
FAILED_ITEMS=()

chk() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1)); printf '  [OK]   %s\n' "$name"
  else
    FAIL=$((FAIL + 1)); FAILED_ITEMS+=("$name"); printf '  [FAIL] %s\n' "$name"
  fi
}
warn() { printf '  [WARN] %s\n' "$*"; }

# 反向代理校验：PREFLIGHT_STRICT=0 -> 仅警告（当前阶段）
#                PREFLIGHT_STRICT=1 -> 计入失败并阻断（生产发布前必须切换）
chk_proxy() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1)); printf '  [OK]   %s\n' "$name"
  elif [ "${PREFLIGHT_STRICT:-0}" = "1" ]; then
    FAIL=$((FAIL + 1)); FAILED_ITEMS+=("$name"); printf '  [FAIL] %s\n' "$name"
  else
    PROXY_WARN=$((PROXY_WARN + 1))
    printf '  [WARN] %s（未阻断；生产发布前须设 PREFLIGHT_STRICT=1）\n' "$name"
  fi
}
PROXY_WARN=0

printf '=== RDPMS preflight ===\n'
printf '时间: %s\n\n' "$(date +%Y-%m-%dT%H:%M:%S%z)"

# ── 0 基础文件 ───────────────────────────────────────────
[ -r "$ENV_FILE" ] || { printf '  [FATAL] 无法读取 %s\n' "$ENV_FILE" >&2; exit 1; }

# 契约真源提示（总控裁定：本地 rdpms 库为废弃库）
warn "契约真源 = schema.prisma + baseline migration；本地 rdpms 库为废弃库，不得作为契约或联调依据"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── 1 环境变量 ───────────────────────────────────────────
printf -- '-- 环境变量 --\n'
chk "DATABASE_URL 为 PostgreSQL"        bash -c '[[ "${DATABASE_URL:-}" == postgresql://* ]]'
chk "DIRECT_URL 为 PostgreSQL"          bash -c '[[ "${DIRECT_URL:-}" == postgresql://* ]]'
chk "JWT_SECRET 长度 >= 32"             bash -c '[ "${#JWT_SECRET}" -ge 32 ]'
chk "JWT_SECRET 非默认值"               bash -c '[[ "${JWT_SECRET:-}" != *"rdpms-jwt-secret"* && "${JWT_SECRET:-}" != *"change"* && "${JWT_SECRET:-}" != *"please-change"* ]]'
chk "NODE_ENV 已设置"                   bash -c '[[ "${NODE_ENV:-}" == development || "${NODE_ENV:-}" == staging || "${NODE_ENV:-}" == production ]]'
chk "production 下 ALLOWED_ORIGINS 非 *" bash -c '[[ "${NODE_ENV:-}" != "production" ]] || { [[ "${ALLOWED_ORIGINS:-}" != "*" ]] && [[ "${ALLOWED_ORIGINS:-}" == http* ]]; }'
chk "UPLOAD_DIR 为绝对路径"             bash -c '[[ "${UPLOAD_DIR:-}" == /* ]]'
chk "UPLOAD_DIR 不在代码目录"           bash -c '[[ "${UPLOAD_DIR:-}" != /opt/rdpms* ]]'
chk "UPLOAD_DIR 指向预期目录"           bash -c '[[ "${UPLOAD_DIR:-}" == "${UPLOAD_DIR_EXPECT}" ]]'
chk "UPLOAD_DIR 存在且 rdpms 可写"      bash -c '[ -d "${UPLOAD_DIR:-}" ] && sudo -u rdpms test -w "${UPLOAD_DIR:-}"'
chk "MAX_UPLOAD_MB 为正整数"            bash -c '[[ "${MAX_UPLOAD_MB:-}" =~ ^[0-9]+$ ]] && [ "${MAX_UPLOAD_MB:-0}" -gt 0 ]'
chk "ENABLE_BACKUP_EXPORT=false"        bash -c '[[ "${ENABLE_BACKUP_EXPORT:-false}" == "false" ]]'
chk "TRUST_PROXY_HOPS 为 1 或 2"        bash -c '[[ "${TRUST_PROXY_HOPS:-1}" =~ ^[12]$ ]]'
chk "SEED_TEST_ACCOUNTS 生产为 false"   bash -c '[[ "${NODE_ENV:-}" != "production" ]] || [[ "${SEED_TEST_ACCOUNTS:-false}" == "false" ]]'
# 弱口令拦截（W7）：production 下命中 please-change / admin123 / 123456 即 FATAL。
# 采用子串匹配（与既有 please-change 判定一致），宁可误报不可放过。
chk "SEED_ADMIN_PASSWORD 非占位非弱口令" \
  bash -c '[[ "${NODE_ENV:-}" != "production" ]] || { [[ -n "${SEED_ADMIN_PASSWORD:-}" ]] && [[ ! "${SEED_ADMIN_PASSWORD}" =~ (please-change|admin123|123456) ]]; }'
chk "JWT_SECRET 非弱口令" \
  bash -c '[[ ! "${JWT_SECRET:-}" =~ (please-change|admin123|123456) ]]'

# ── 2 文件与权限 ─────────────────────────────────────────
printf -- '\n-- 文件与权限 --\n'
chk ".env 权限为 640 root:rdpms"        bash -c '[ "$(stat -c "%a %U:%G" "${ENV_FILE}")" = "640 root:rdpms" ]'
chk "rdpms 可读 .env 且不可写"          bash -c 'sudo -u rdpms test -r "${ENV_FILE}" && ! sudo -u rdpms test -w "${ENV_FILE}"'
chk "代码目录不存在 .env"               bash -c '! [ -e "${APP_DIR}/.env" ]'
chk "应用目录存在"                      bash -c '[ -d "${APP_DIR}" ]'
chk "index.js 存在"                     bash -c '[ -f "${APP_DIR}/src/index.js" ]'
chk "不存在 dev.db"                     bash -c '! [ -e "${APP_DIR}/prisma/dev.db" ]'
chk "schema 非 sqlite"                  bash -c '! grep -qE "provider[[:space:]]*=[[:space:]]*\"sqlite\"" "${APP_DIR}/prisma/schema.prisma"'
chk "无 PRAGMA 残留"                    bash -c '! grep -rq "PRAGMA" "${APP_DIR}/src"'
chk "无 ensure* 补丁"                   bash -c '! grep -rqE "ensure[A-Z]" "${APP_DIR}/src"'
chk "无 JWT 默认 secret"                bash -c '! grep -rq "rdpms-jwt-secret" "${APP_DIR}/src"'

# ── 3 网络暴露面 ─────────────────────────────────────────
printf -- '\n-- 网络暴露面 --\n'
chk "5432 仅监听回环"                   bash -c '! ss -lnt | grep -qE "(0\.0\.0\.0|\*|\[::\]):5432"'
chk "3000 仅监听回环"                   bash -c '! ss -lnt | grep -qE "(0\.0\.0\.0|\*|\[::\]):3000"'

# ── 4 反向代理（按 RDPMS_PROXY_MODE 校验）─────────────────
# RDPMS_PROXY_MODE = nginx80 | caddy_domain | caddy_8081 | none
# 由 §1 端口探测结果决定；未设置前只能做提示，不得作为生产门禁。
printf -- '\n-- 反向代理（mode=%s, strict=%s）--\n' "${RDPMS_PROXY_MODE:-unset}" "${PREFLIGHT_STRICT:-0}"

case "${RDPMS_PROXY_MODE:-unset}" in
  nginx80)
    chk_proxy "Nginx 运行中"                    bash -c 'systemctl is-active --quiet nginx'
    chk_proxy "Nginx 监听 80"                   bash -c 'ss -lnt | grep -qE ":80\b"'
    chk_proxy "nginx -t 通过"                   bash -c 'nginx -t'
    chk_proxy "Nginx root 指向 frontend/dist"   bash -c 'grep -rq "/opt/rdpms/current/rdpms-system/frontend/dist" /etc/nginx/sites-enabled/ 2>/dev/null'
    chk_proxy "ALLOWED_ORIGINS 不含高端口"      bash -c '[[ "${ALLOWED_ORIGINS:-}" != *":8081"* ]]'
    chk_proxy "TRUST_PROXY_HOPS=1"              bash -c '[[ "${TRUST_PROXY_HOPS:-1}" == "1" ]]'
    ;;
  caddy_domain)
    chk_proxy "Caddy 运行中"                    bash -c 'systemctl is-active --quiet caddy'
    chk_proxy "rdpms.caddy 站点文件存在"        bash -c '[ -f /etc/caddy/sites/rdpms.caddy ]'
    chk_proxy "caddy validate 通过"             bash -c 'caddy validate --config /etc/caddy/Caddyfile'
    chk_proxy "ALLOWED_ORIGINS 为 https 域名"   bash -c '[[ "${ALLOWED_ORIGINS:-}" == https://* ]] && [[ "${ALLOWED_ORIGINS}" != *":8081"* ]]'
    chk_proxy "TRUST_PROXY_HOPS=1"              bash -c '[[ "${TRUST_PROXY_HOPS:-1}" == "1" ]]'
    ;;
  caddy_8081)
    chk_proxy "Caddy 运行中"                    bash -c 'systemctl is-active --quiet caddy'
    chk_proxy "rdpms.caddy 站点文件存在"        bash -c '[ -f /etc/caddy/sites/rdpms.caddy ]'
    chk_proxy "caddy validate 通过"             bash -c 'caddy validate --config /etc/caddy/Caddyfile'
    chk_proxy "监听 8081"                       bash -c 'ss -lnt | grep -qE ":8081\b"'
    chk_proxy "ALLOWED_ORIGINS 带 :8081"        bash -c '[[ "${ALLOWED_ORIGINS:-}" == *":8081"* ]]'
    chk_proxy "TRUST_PROXY_HOPS=1"              bash -c '[[ "${TRUST_PROXY_HOPS:-1}" == "1" ]]'
    warn "8081 为临时联调方案，非长期生产标准"
    ;;
  none)
    chk_proxy "mode=none 仅允许非 production"   bash -c '[[ "${NODE_ENV:-}" != "production" ]]'
    ;;
  *)
    warn "RDPMS_PROXY_MODE 未设置（nginx80|caddy_domain|caddy_8081|none）"
    warn "端口探测结果确认后必须设置该变量，并将 PREFLIGHT_STRICT 置为 1"
    if systemctl is-active --quiet caddy 2>/dev/null; then
      warn "检测到 Caddy 运行中（不得停止，foodtestlab 可能依赖）"
    fi
    if systemctl is-active --quiet nginx 2>/dev/null; then
      warn "检测到 Nginx 运行中"
    fi
    ;;
esac

# ── 5 契约门禁（PREFLIGHT_STRICT=1 时阻断）─────────────────
# 门禁项：STRICT=1 命中即 FAIL；STRICT=0 仅 WARN（开发期联调用）
chk_gate() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1)); printf '  [OK]   %s\n' "$name"
  elif [ "${PREFLIGHT_STRICT:-0}" = "1" ]; then
    FAIL=$((FAIL + 1)); FAILED_ITEMS+=("$name"); printf '  [FAIL] %s\n' "$name"
  else
    GATE_WARN=$((GATE_WARN + 1)); printf '  [WARN] %s（STRICT=1 时将阻断）\n' "$name"
  fi
}
GATE_WARN=0

# 由调用方直接给出布尔结果（0=通过 / 非0=不通过）的门禁项
gate_result() {
  local name="$1" rc="$2" detail="${3:-}"
  if [ "$rc" -eq 0 ]; then
    PASS=$((PASS + 1)); printf '  [OK]   %s\n' "$name"
  elif [ "${PREFLIGHT_STRICT:-0}" = "1" ]; then
    FAIL=$((FAIL + 1)); FAILED_ITEMS+=("$name"); printf '  [FAIL] %s %s\n' "$name" "$detail"
  else
    GATE_WARN=$((GATE_WARN + 1)); printf '  [WARN] %s %s（STRICT=1 时将阻断）\n' "$name" "$detail"
  fi
}

# AuditAction 清单检查（总控：19 个 action；真源 = seed / EnumMeta）
# 清单由 BE/DB 提供，未提供时该项 BLOCKED-BY-BE（仅 WARN，不阻断）。
#   sudo env AUDIT_ACTIONS_EXPECTED='created,updated,deleted,...' bash preflight.sh
# M-1 v1.0 §4 冻结 19 项（默认值；如 BE/DB 清单变化须走 M-1 v1.1 变更）
AUDIT_ACTIONS_EXPECTED_DEFAULT='create,update,delete,restore,login,login.failed,logout,token.refresh,password.change,permission.change,submit,approve,reject,assign,status.change,upload,download,export,read.sensitive'
AUDIT_ACTIONS_EXPECTED="${AUDIT_ACTIONS_EXPECTED:-$AUDIT_ACTIONS_EXPECTED_DEFAULT}"
audit_actions_check() {
  if [ -z "$AUDIT_ACTIONS_EXPECTED" ]; then
    # BLOCKED-BY-BE 必须按失败处理（STRICT=1 阻断；宽松模式告警），不得当作 SKIP
    gate_result "AuditAction 清单检查" 1 "AUDIT_ACTIONS_EXPECTED 未提供（BLOCKED-BY-BE）"
    return 0
  fi
  local total=0 missing="" a oldifs="${IFS:- }"
  IFS=','
  set -f
  for a in $AUDIT_ACTIONS_EXPECTED; do
    a="$(printf '%s' "$a" | tr -d '[:space:]')"
    [ -z "$a" ] && continue
    total=$((total + 1))
    if ! grep -qF -- "$a" "$SEED_JS" 2>/dev/null; then
      if [ -z "$missing" ]; then missing="$a"; else missing="${missing},${a}"; fi
    fi
  done
  set +f
  IFS="$oldifs"
  if [ -z "$missing" ]; then
    gate_result "seed 包含全部 AuditAction（${total} 个）" 0
  else
    gate_result "seed 包含全部 AuditAction（${total} 个）" 1 "缺失: ${missing}"
  fi
}

# 判断 enum 是否包含某成员（在 enum 块内精确匹配，避免跨 enum 误判）
enum_has() {
  local enum="$1" member="$2"
  awk -v e="$enum" -v m="$member" '
    $1 == "enum" && $2 == e { inside = 1; next }
    inside && $1 == "}"      { inside = 0 }
    inside && $1 == m        { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$SCHEMA"
}

printf -- '\n-- 契约门禁（strict=%s）--\n' "${PREFLIGHT_STRICT:-0}"

if [ ! -f "$SCHEMA" ]; then
  printf '  [WARN] 未找到 schema.prisma，跳过 5.1/5.2：%s\n' "$SCHEMA"
else
  printf '  [5.1] schema 禁项\n'
  chk_gate "无 PermissionCode（权限真源 = DB permissions.code）" \
    bash -c '! grep -q   "PermissionCode" "$SCHEMA"'
  # Errata-01/E-03：EnumMeta / 文档中的普通字符串 AuditAction 允许存在，只禁 schema 中的 enum 声明
  chk_gate "无 enum AuditAction 声明（AuditLog.action = string，非 enum）" \
    bash -c '! grep -qE "^enum AuditAction\b" "$SCHEMA"'
  chk_gate "无 PROJECT_MANAGER / RESEARCHER" \
    bash -c '! grep -qE  "PROJECT_MANAGER|RESEARCHER" "$SCHEMA"'
  chk_gate "无 QUARANTINE（用 -w，避免误伤 QUARANTINED）" \
    bash -c '! grep -qw  "QUARANTINE" "$SCHEMA"'

  printf '  [5.2] schema 必须存在项\n'
  chk_gate "model Permission 存在"            bash -c 'grep -qE "^model Permission\b" "$SCHEMA"'
  chk_gate "enum TemplateCategory 存在"       bash -c 'grep -qE "^enum TemplateCategory\b" "$SCHEMA"'
  chk_gate "enum MaterialStatus 存在"         bash -c 'grep -qE "^enum MaterialStatus\b" "$SCHEMA"'
  chk_gate "enum LotStatus 存在"              bash -c 'grep -qE "^enum LotStatus\b" "$SCHEMA"'
  chk_gate "enum FileScanStatus 存在"         bash -c 'grep -qE "^enum FileScanStatus\b" "$SCHEMA"'
  chk_gate "enum RegulatoryDocStatus 存在"    bash -c 'grep -qE "^enum RegulatoryDocStatus\b" "$SCHEMA"'
  chk_gate "FileScanStatus 含 SKIPPED"        enum_has FileScanStatus SKIPPED
  chk_gate "SampleStatus 含 SEALED"           enum_has SampleStatus SEALED
  chk_gate "SampleStatus 含 QUARANTINED"      enum_has SampleStatus QUARANTINED
  chk_gate "SystemRole 含 MANAGER"            enum_has SystemRole MANAGER
fi

printf '  [5.3] migration 禁项（方案 B：朴素 grep）\n'
# 方案 B 说明：DB 窗口必须删除 migration 中所有 pg_trgm / pgcrypto 注释行，
# OPS 侧使用朴素 grep（不做注释过滤），以保证「注释里残留」也能被抓出。
if [ ! -d "$MIG_DIR" ]; then
  chk_gate "migrations 目录存在" bash -c 'false'
else
  chk_gate "migrations 无 pgcrypto / pg_trgm / gen_random_uuid / CREATE EXTENSION" \
    bash -c '! grep -rqE "pgcrypto|pg_trgm|gen_random_uuid|CREATE EXTENSION" "$MIG_DIR"'
fi

if [ ! -f "$SEED_JS" ]; then
  printf '  [WARN] 未找到 seed.js，跳过 5.4：%s\n' "$SEED_JS"
else
  printf '  [5.4] seed 禁项\n'
  chk_gate "seed 无 PermissionCode / PROJECT_MANAGER / RESEARCHER" \
    bash -c '! grep -qE "PermissionCode|PROJECT_MANAGER|RESEARCHER" "$SEED_JS"'
  # 弱口令双处拦截（W7）：seed 必须自带黑名单并强制 throw；禁止把弱口令用作默认密码
  chk_gate "seed 含弱口令黑名单（WEAK_PASSWORDS）" \
    bash -c 'grep -q "WEAK_PASSWORDS" "$SEED_JS"'
  chk_gate "seed 禁止弱口令作为默认密码/回退" \
    bash -c 'grep -qE "(password|PASSWORD)" "$SEED_JS" && ! grep -qE "passwordHash[[:space:]]*[:=][[:space:]]*[\"'"'"'](admin123|123456|please-change)" "$SEED_JS" && ! grep -qE "\|\|[[:space:]]*[\"'"'"'](admin123|123456|please-change)" "$SEED_JS"'
  chk_gate "seed 强制 mustChangePassword" \
    bash -c 'grep -q "mustChangePassword: true" "$SEED_JS"'
  chk_gate "seed 无 QUARANTINE（用 -w）" \
    bash -c '! grep -qw  "QUARANTINE" "$SEED_JS"'
  chk_gate "seed 无旧权限码（USER_VIEW 等）" \
    bash -c '! grep -qE "USER_VIEW|USER_MANAGE|PROJECT_VIEW|ROLE_MANAGE|FILE_UPLOAD|AUDIT_VIEW|DATA_EXPORT" "$SEED_JS"'
  # M-1 v1.0：override 是 BE 行为，不得作为 permission code 写入 seed
  chk_gate "seed 无 override / elevate 权限码" \
    bash -c '! grep -qE "\.(override|elevate)\b" "$SEED_JS"'
  # M-1 v1.0：reagents.export 为 P0 唯一试剂导出出口
  chk_gate "seed 含 reagents.export（P0）" \
    bash -c 'grep -q  "reagents\.export" "$SEED_JS"'
  # AuditLog.action = string（非 enum）；真源为 seed / EnumMeta，schema 侧由 5.1 拦截
  audit_actions_check
fi

if [ ! -d "$BE_SRC" ]; then
  printf '  [WARN] 未找到后端 src，跳过 5.5：%s\n' "$BE_SRC"
else
  printf '  [5.5] 后端代码禁项\n'
  chk_gate "后端无 data: body（mass assignment）" \
    bash -c '! grep -rq  "data: body" "$BE_SRC"'
  chk_gate "后端无 ROLE_PERMISSIONS 硬编码" \
    bash -c '! grep -rq  "ROLE_PERMISSIONS" "$BE_SRC"'
  # 注意：若 BE 最终采用 authGuard / requireAuth 作为「新中间件命名」，本项会误伤，
  #       需 BE 确认命名后调整；见阻塞项。
  chk_gate "后端无 authGuard / requireAuth（旧中间件命名）" \
    bash -c '! grep -rqE "authGuard|requireAuth" "$BE_SRC"'
  chk_gate "后端无旧权限码" \
    bash -c '! grep -rqE "USER_VIEW|USER_MANAGE|PROJECT_VIEW|ROLE_MANAGE|FILE_UPLOAD|AUDIT_VIEW|DATA_EXPORT" "$BE_SRC"'
  chk_gate "后端无 PROJECT_MANAGER / RESEARCHER" \
    bash -c '! grep -rqE "PROJECT_MANAGER|RESEARCHER" "$BE_SRC"'
  chk_gate "后端无 QUARANTINE（用 -w）" \
    bash -c '! grep -rqw "QUARANTINE" "$BE_SRC"'
  # /api/dict 登录后即可访问，不存在 dict.read 权限点
  chk_gate "后端无 dict.read 权限点" \
    bash -c '! grep -rq  "dict\.read" "$BE_SRC"'
  # 旧 Reagent 模型已删除；prisma.reagent. 为旧委托（prisma.reagentMaterial. 不受影响）
  chk_gate "后端无 prisma.reagent.（旧 Reagent 委托）" \
    bash -c '! grep -rqE "prisma\.reagent\." "$BE_SRC"'
  # /api/reagents 为聚合路由（P0 契约端点）
  chk_gate "后端注册 /api/reagents 聚合路由" \
    bash -c 'grep -rq "api/reagents" "$BE_SRC"'
  # 底层表只能是 reagent_materials / reagent_lots / reagent_formulas，禁止旧 Reagent 委托
  # （prisma.reagent.findMany / .create / .update / .delete 等均被此项覆盖；
  #   prisma.reagentMaterial.* 不受影响）
  chk_gate "后端无 prisma.reagent 委托" \
    bash -c '! grep -rqE "prisma\.reagent\." "$BE_SRC"'
  # M-1 v1.0：SUPER_ADMIN 项目 override 属 BE 行为，不得注册为 permission code
  chk_gate "后端无 override / elevate 类权限码" \
    bash -c '! grep -rqE "\.(override|elevate)\b" "$BE_SRC"'
  # M-1 v1.0：override 行为必须写 AuditLog 且 metadata.elevated = true。
  # BE 未实现 override 前该项仅为提示，不阻断发布（BLOCKED-BY-BE）。
  if grep -rq "metadata" "$BE_SRC" 2>/dev/null && grep -rq "elevated" "$BE_SRC" 2>/dev/null; then
    PASS=$((PASS + 1)); printf '  [OK]   后端 override 审计含 metadata.elevated\n'
  else
    printf '  [WARN] 后端未见 metadata.elevated —— override 审计未实现（BLOCKED-BY-BE，不阻断）\n'
  fi
fi

if [ ! -d "$FE_SRC" ]; then
  printf '  [WARN] 未找到前端 src，跳过 5.6：%s\n' "$FE_SRC"
else
  printf '  [5.6] 前端代码禁项\n'
  chk_gate "前端无 PROJECT_MANAGER / RESEARCHER" \
    bash -c '! grep -rqE "PROJECT_MANAGER|RESEARCHER" "$FE_SRC"'
  chk_gate "前端无 QUARANTINE（用 -w）" \
    bash -c '! grep -rqw "QUARANTINE" "$FE_SRC"'
  chk_gate "前端无旧权限码" \
    bash -c '! grep -rqE "audit\.read|system\.logs\.read|system\.settings\.manage|projects\.edit|tasks\.update_status|users\.manage|dict\.read" "$FE_SRC"'
  # WARN 级：只读展示允许，提交字段不允许，需人工复核
  if grep -rq "systemRole" "${FE_SRC}/pages/Users.tsx" 2>/dev/null; then
    warn "Users.tsx 出现 systemRole —— 只读展示允许，提交字段不允许，需人工复核"
  fi
fi

# ── 6 权限 SQL 契约检查（预留，默认不执行）─────────────────
# 本脚本默认不访问数据库。需人工确认后显式触发：
#   sudo env RUN_SQL_CONTRACT=1 DB_CONTRACT=rdpms_staging bash /usr/local/bin/rdpms-preflight.sh
DB_CONTRACT="${DB_CONTRACT:-rdpms}"
# ── M-1 v1.0 冻结值（OPS 只做校验，不定义；变更须走 M-1 v1.1 申请）──
# P0 = 90 / P1 = 30；批次二解冻 8 码（P1_UNFROZEN，见 kernel/constants.js）随 P0 一起入 permissions 表
# → 期望入库总数 = 98；未解冻 P1 仍不得入库
PERMISSIONS_EXPECTED="${PERMISSIONS_EXPECTED:-98}"
# 角色权限数：SUPER_ADMIN 90 / ADMIN 80（90 - 10 排除项）/ AUDITOR 3 / MANAGER 66 / MEMBER 31 / VIEWER 19
ADMIN_EXPECTED="${ADMIN_EXPECTED:-80}"
MANAGER_EXPECTED="${MANAGER_EXPECTED:-66}"
MEMBER_EXPECTED="${MEMBER_EXPECTED:-31}"
VIEWER_EXPECTED="${VIEWER_EXPECTED:-19}"
ROLE_PERMISSIONS_EXPECTED="${ROLE_PERMISSIONS_EXPECTED:-289}"
SUPER_ADMIN_EXPECTED="${SUPER_ADMIN_EXPECTED:-90}"
# P1 未解冻项：不得入库（批次二解冻的 8 码已出列：projects.delete / tasks.delete / reports.delete /
# docs.delete / project_templates.copy / primers.import / primers.delete / reagent_materials.delete）
P1_CODES="reagent_materials.export,files.view,files.restore"
# 解冻子集：必须入库（与 kernel/constants.js P1_UNFROZEN 逐字一致）
P1_UNFROZEN_CODES="projects.delete,tasks.delete,reports.delete,docs.delete,project_templates.copy,primers.import,primers.delete,reagent_materials.delete"

sql_chk() {
  local name="$1" sql="$2" want="$3" got
  got=$(sudo -u postgres psql -tAc "$sql" "$DB_CONTRACT" 2>/dev/null | tr -d '[:space:]')
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1)); printf '  [OK]   %s\n' "$name"
  else
    FAIL=$((FAIL + 1)); FAILED_ITEMS+=("$name")
    printf '  [FAIL] %s (期望=%s 实际=%s)\n' "$name" "$want" "${got:-<empty>}"
  fi
}

contract_check_sql() {
  printf '  [6.x] 权限 SQL 契约（库=%s）\n' "$DB_CONTRACT"
  printf '  [6.0] 说明：以下表名/列名（permissions.code / roles.code / role_permissions /\n'
  printf '        audit_logs.metadata / file_objects.scan_status）依 M-1 v1.0 假设；\n'
  printf '        若 DB 最终命名不同需同步修订（BLOCKED-BY-DB）。\n'

  # ── 权限总数 ──
  sql_chk "permissions 总数 = ${PERMISSIONS_EXPECTED}" \
    "SELECT count(*) FROM permissions;" "${PERMISSIONS_EXPECTED}"

  # ── P1 未解冻项不得入库 ──
  sql_chk "P1 未解冻权限不在库（${P1_CODES}）" \
    "SELECT count(*) FROM permissions WHERE code IN ('reagent_materials.export','files.view','files.restore');" "0"

  # ── P1 解冻子集必须入库（批次二，8 码）──
  sql_chk "P1 解冻子集在库（8 码）" \
    "SELECT count(*) FROM permissions WHERE code IN ('projects.delete','tasks.delete','reports.delete','docs.delete','project_templates.copy','primers.import','primers.delete','reagent_materials.delete');" "8"

  # ── P0 必须项：reagents.export 为试剂聚合导出唯一出口（P0）──
  sql_chk "reagents.export 存在（P0 唯一试剂导出出口）" \
    "SELECT count(*) FROM permissions WHERE code='reagents.export';" "1"

  # ── 命名空间：Permission.code = resource.action（允许多段，如 docs.categories.manage / system.logs.view）──
  # M-1 v1.0：SUPER_ADMIN 项目 override 属 BE 行为，不进 permissions.code
  sql_chk "permissions.code 符合 resource.action 命名空间" \
    "SELECT count(*) FROM permissions WHERE code !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$';" "0"
  sql_chk "permissions.code 无 elevated / override（属 BE 行为）" \
    "SELECT count(*) FROM permissions WHERE code LIKE '%elevated%' OR code LIKE '%override%';" "0"

  # ── AUDITOR：恰好 3 条 = audit.view + audit.export + system.logs.view ──
  sql_chk "AUDITOR 权限数 = 3" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='AUDITOR';" "3"
  sql_chk "AUDITOR 持有 audit.view" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='AUDITOR' AND p.code='audit.view';" "1"
  sql_chk "AUDITOR 持有 audit.export" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='AUDITOR' AND p.code='audit.export';" "1"
  sql_chk "AUDITOR 持有 system.logs.view" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='AUDITOR' AND p.code='system.logs.view';" "1"

  # ── ADMIN：81 条 = 90 - 8 高危 - audit.export；持有 audit.view ──
  # 注意：8 项高危清单以 W8 签字版为准；若清单调整需同步改本脚本（BLOCKED-BY-W8）
  sql_chk "ADMIN 权限数 = ${ADMIN_EXPECTED}" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='ADMIN';" "${ADMIN_EXPECTED}"
  sql_chk "ADMIN 持有 audit.view" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='ADMIN' AND p.code='audit.view';" "1"
  sql_chk "ADMIN 无 audit.export" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='ADMIN' AND p.code='audit.export';" "0"

  # ── SUPER_ADMIN：90 条（全量）──
  sql_chk "SUPER_ADMIN 权限数 = ${SUPER_ADMIN_EXPECTED}" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='SUPER_ADMIN';" "${SUPER_ADMIN_EXPECTED}"
  sql_chk "MANAGER 权限数 = ${MANAGER_EXPECTED}" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='MANAGER';" "${MANAGER_EXPECTED}"
  sql_chk "MEMBER 权限数 = ${MEMBER_EXPECTED}" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='MEMBER';" "${MEMBER_EXPECTED}"
  sql_chk "VIEWER 权限数 = ${VIEWER_EXPECTED}" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='VIEWER';" "${VIEWER_EXPECTED}"
  sql_chk "RolePermission 总数 = ${ROLE_PERMISSIONS_EXPECTED}" \
    "SELECT count(*) FROM role_permissions;" "${ROLE_PERMISSIONS_EXPECTED}"

  # ── 持有范围（M-1 v1.0）──
  #   audit.view       : SUPER_ADMIN + ADMIN + AUDITOR
  #   system.logs.view : SUPER_ADMIN + AUDITOR
  sql_chk "audit.view 仅 SUPER_ADMIN + ADMIN + AUDITOR" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='audit.view' AND r.code NOT IN ('SUPER_ADMIN','ADMIN','AUDITOR');" "0"
  sql_chk "system.logs.view 仅 SUPER_ADMIN + AUDITOR" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='system.logs.view' AND r.code NOT IN ('SUPER_ADMIN','AUDITOR');" "0"

  sql_chk "roles.assign_user 存在" \
    "SELECT count(*) FROM permissions WHERE code='roles.assign_user';" "1"
  sql_chk "system.logs.view 存在" \
    "SELECT count(*) FROM permissions WHERE code='system.logs.view';" "1"
  sql_chk "data.export 存在" \
    "SELECT count(*) FROM permissions WHERE code='data.export';" "1"
  sql_chk "system.logs_view 不存在" \
    "SELECT count(*) FROM permissions WHERE code='system.logs_view';" "0"
  sql_chk "ADMIN 总排除 10 项（8 高危 + audit.export + system.logs.view）" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='ADMIN' AND p.code IN ('users.delete','roles.create','roles.update','roles.delete','roles.assign_permissions','roles.assign_user','settings.update','data.export','audit.export','system.logs.view');" "0"
  sql_chk "data.export 仅 SUPER_ADMIN" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='data.export' AND r.code<>'SUPER_ADMIN';" "0"
  sql_chk "roles.assign_user 仅 SUPER_ADMIN" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='roles.assign_user' AND r.code<>'SUPER_ADMIN';" "0"
  sql_chk "users.delete 仅 SUPER_ADMIN" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='users.delete' AND r.code<>'SUPER_ADMIN';" "0"
  sql_chk "audit.export 仅 SUPER_ADMIN + AUDITOR" \
    "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='audit.export' AND r.code NOT IN ('SUPER_ADMIN','AUDITOR');" "0"
  sql_chk "无 pgcrypto / pg_trgm" \
    "SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto','pg_trgm');" "0"
  sql_chk "audit_logs.action 为 varchar(64)" \
    "SELECT count(*) FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='action' AND data_type='character varying' AND character_maximum_length=64;" "1"
  sql_chk "file_objects.scan_status 默认 SKIPPED" \
    "SELECT count(*) FROM information_schema.columns WHERE table_name='file_objects' AND column_name='scan_status' AND column_default LIKE '%SKIPPED%';" "1"
  sql_chk "file_objects.scanned_at 存在" \
    "SELECT count(*) FROM information_schema.columns WHERE table_name='file_objects' AND column_name='scanned_at';" "1"

  # ── AuditLog.metadata 与 GIN 索引 ──
  sql_chk "audit_logs.metadata 存在" \
    "SELECT count(*) FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='metadata';" "1"
  sql_chk "audit_logs_metadata_gin_idx 存在" \
    "SELECT count(*) FROM pg_indexes WHERE indexname='audit_logs_metadata_gin_idx';" "1"
}

if [ "${RUN_SQL_CONTRACT:-0}" = "1" ]; then
  printf -- '\n-- 权限 SQL 契约检查（RUN_SQL_CONTRACT=1）--\n'
  contract_check_sql
else
  printf -- '\n-- 权限 SQL 契约检查：已定义未执行（RUN_SQL_CONTRACT=1 手动触发；本脚本默认不访问数据库）--\n'
fi

# ── 7 结果 ──────────────────────────────────────────────
printf -- '\n=== 结果: 通过 %s / 失败 %s / 代理告警 %s / 门禁告警 %s ===\n' \
  "$PASS" "$FAIL" "$PROXY_WARN" "$GATE_WARN"
if [ "${PREFLIGHT_STRICT:-0}" != "1" ]; then
  printf '提示：当前为宽松模式（PREFLIGHT_STRICT=0）。\n'
  printf '      staging/production 必须 PREFLIGHT_STRICT=1，并设置 RDPMS_PROXY_MODE。\n'
  if [ "$GATE_WARN" -gt 0 ]; then
    printf '      门禁告警 %s 项在 STRICT=1 下将转为失败并阻断发布。\n' "$GATE_WARN"
  fi
fi
if [ "$FAIL" -gt 0 ]; then
  printf '失败项：\n'
  printf '  - %s\n' ${FAILED_ITEMS[@]+"${FAILED_ITEMS[@]}"}
  exit 1
fi
printf 'preflight 全部通过\n'
