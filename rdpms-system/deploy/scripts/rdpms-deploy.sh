#!/usr/bin/env bash
#
# rdpms-deploy.sh —— 原地发布（foodsentinel 模式）
#
# 用法（以 ubuntu 身份执行，脚本内部用 sudo 重启服务）
#   bash rdpms-system/deploy/scripts/rdpms-deploy.sh [分支]      # 默认 main
#   SKIP_INSTALL=1 bash ... rdpms-deploy.sh                      # 强制跳过依赖安装
#
# 流程
#   1 取码（fetch + ff-only merge，绝不产生 merge commit）
#   2/3 依赖（仅在 package-lock.json 实际变化时才 npm ci —— 本机到 GitHub 带宽约 36KB/s，
#       无脑 ci 会让每次发布多等十几分钟）
#   4 Prisma Client 生成 + migrate deploy
#   5/6 后端/前端构建
#   7 重启服务并校验 active
#
# 回滚
#   git -C /opt/rdpms/app checkout <上一个提交> && bash .../rdpms-deploy.sh
#   注意：迁移是前滚的，不会自动回退；本次新增的列/表/触发器对旧代码兼容（见交付说明），
#        但回滚代码不等于回滚数据库。
#
set -Eeuo pipefail

APP="${RDPMS_APP_DIR:-/opt/rdpms/app}"
BRANCH="${1:-main}"
SERVICE="${RDPMS_SERVICE:-rdpms-api.service}"
BUILD="rdpms-system"

log() { printf '\n[deploy] %s\n' "$*"; }
die() { printf '[deploy][FATAL] %s\n' "$*" >&2; exit 1; }

# Prisma 需要 DATABASE_URL 与 DIRECT_URL。生产配置在 /srv/rdpms/.env（root:rdpms 640），
# 以 ubuntu 身份运行本脚本时读不到，因此按需以 sudo 取这两项并导出到本进程环境 ——
# 只导出这两项，不 source 整个文件（避免把无关变量带进构建环境）。
ENV_FILE="${RDPMS_ENV_FILE:-/srv/rdpms/.env}"
load_db_env() {
  local line key val
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"
    case "$key" in
      DATABASE_URL|DIRECT_URL)
        val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
        export "$key=$val"
        ;;
    esac
  done < <(sudo -n cat "$ENV_FILE")
  [ -n "${DATABASE_URL:-}" ] || die "未能从 $ENV_FILE 读取 DATABASE_URL"
}

[ -d "$APP/$BUILD" ] || die "运行目录不完整：$APP/$BUILD"
cd "$APP"

# ── 1 取码 ───────────────────────────────────────────────────────────────────
log "1/7 取码 origin/$BRANCH"
PREV="$(git rev-parse HEAD)"
git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH" || die "无法快进合并（本地有未推送提交或分叉）"
NEW="$(git rev-parse HEAD)"
printf '      %s -> %s  %s\n' "${PREV:0:8}" "${NEW:0:8}" "$(git log -1 --format=%s)"

if [ "$PREV" = "$NEW" ]; then
  log "代码无变化（$NEW），仍会重新构建并重启"
fi

# 依赖是否需要重装：仅当对应 package-lock.json 在本次取码中变化
needs_install() {
  [ "${SKIP_INSTALL:-0}" = "1" ] && return 1
  [ "$PREV" = "$NEW" ] && return 1
  ! git diff --quiet "$PREV" "$NEW" -- "$1"
}

# ── 2/3 依赖 ─────────────────────────────────────────────────────────────────
if needs_install "$BUILD/backend/package-lock.json"; then
  log "2/7 后端依赖（package-lock 有变化，npm ci）"
  ( cd "$BUILD/backend" && npm ci --no-audit --no-fund )
else
  log "2/7 后端依赖：package-lock 未变化，跳过安装"
fi

if needs_install "$BUILD/frontend/package-lock.json"; then
  log "3/7 前端依赖（package-lock 有变化，npm ci）"
  ( cd "$BUILD/frontend" && npm ci --no-audit --no-fund )
else
  log "3/7 前端依赖：package-lock 未变化，跳过安装"
fi

# ── 4 Prisma Client 与迁移 ───────────────────────────────────────────────────
log "4/7 Prisma Client 生成 + migrate deploy"
load_db_env
( cd "$BUILD/backend" && npx --no-install prisma generate && npx --no-install prisma migrate deploy )
unset DATABASE_URL DIRECT_URL

# ── 5/6 构建 ─────────────────────────────────────────────────────────────────
log "5/7 后端构建（tsc -> dist）"
( cd "$BUILD/backend" && npm run build )
[ -f "$BUILD/backend/dist/index.js" ] || die "后端构建产物缺失：$BUILD/backend/dist/index.js"

log "6/7 前端构建（tsc -b && vite build）"
( cd "$BUILD/frontend" && npm run build )
[ -f "$BUILD/frontend/dist/index.html" ] || die "前端构建产物缺失：$BUILD/frontend/dist/index.html"

# ── 7 重启 ───────────────────────────────────────────────────────────────────
log "7/7 重启 $SERVICE"
sudo systemctl restart "$SERVICE"
sleep 3
systemctl is-active "$SERVICE" >/dev/null || die "服务未处于 active，请查看 journalctl -u $SERVICE -n 50"
printf '[deploy] %s 已重启并处于 active\n' "$SERVICE"

log "完成：HEAD=$(git rev-parse --short HEAD)"
