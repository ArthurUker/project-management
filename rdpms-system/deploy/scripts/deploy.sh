#!/usr/bin/env bash
#
# rdpms-deploy.sh — RDPMS 发布脚本
#
# 总控裁定落实：
#   #15 路径统一 /opt/rdpms/current/rdpms-system/{backend,frontend}
#   #16 起始处安全加载 /srv/rdpms/.env（禁止打印），供前端构建期变量使用
#   #4  代码获取采用 SSH deploy key
#   #3  生产只允许 prisma migrate deploy，禁止 db push / migrate dev / migrate reset
#
# 反向代理：本脚本不落盘 Nginx/Caddy 配置，仅对"已运行"的代理做 reload。
#           端口探测结果确认前，代理配置需另行部署。
#
# 用法：
#   sudo REPO=git@github.com:<org>/<repo>.git BRANCH=main bash deploy/scripts/rdpms-deploy.sh
#   sudo RUN_SEED=true  ... bash deploy/scripts/rdpms-deploy.sh    # 仅首次联调
#   sudo PROFILE=full SMOKE_ENV=staging ... bash deploy/scripts/rdpms-deploy.sh
#
set -Eeuo pipefail

# ── Step 0 安全加载环境变量（总控裁定 #16）──────────────────
# 注意：仅 source，绝不 echo/printf 任何变量值；禁止对本脚本使用 set -x。
ENV_FILE="${ENV_FILE:-/srv/rdpms/.env}"
if [ ! -r "$ENV_FILE" ]; then
  printf '[deploy] FATAL: 无法读取 %s\n' "$ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REPO="${REPO:?需要设置 REPO=git@github.com:<org>/<repo>.git}"
BRANCH="${BRANCH:-main}"
REL="${REL:-$(date +%Y%m%d-%H%M)}"
RELEASE_ROOT="/opt/rdpms/releases/${REL}"
RELEASE_DIR="${RELEASE_ROOT}/rdpms-system"
APP_DIR="${RELEASE_DIR}/backend"
WEB_DIR="${RELEASE_DIR}/frontend"
PROFILE="${PROFILE:-read-only}"      # read-only(生产) | full(local/staging)
SMOKE_ENV="${SMOKE_ENV:-production}" # local | staging | production
RUN_SEED="${RUN_SEED:-false}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
RUN_USER="${RUN_USER:-rdpms}"
RUN_HOME="${RUN_HOME:-/var/lib/rdpms}"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy][FATAL] %s\n' "$*" >&2; exit 1; }

# 硬约束：生产禁止破坏性 Prisma 命令
prisma() {
  case "$*" in
    *"db push"*|*"migrate dev"*|*"migrate reset"*)
      die "生产禁止执行: prisma $* ；只允许 migrate deploy" ;;
  esac
  # 禁止经 npm script 绕过本包装：db:migrate / db:push:local-only / db:migrate:reset
  case "$*" in
    *"run db:migrate"*|*"run db:push"*) die "生产禁止经 npm script 执行 migrate/push" ;;
  esac
  sudo -u "$RUN_USER" env HOME="$RUN_HOME" /usr/local/bin/rdpms-env npx prisma "$@"
}
as_app() { sudo -u "$RUN_USER" env HOME="$RUN_HOME" /usr/local/bin/rdpms-env "$@"; }
as_user() { sudo -u "$RUN_USER" env HOME="$RUN_HOME" "$@"; }

# 反向代理 reload：仅处理"已在运行"的代理，未配置则告警不阻断
reload_proxy() {
  local reloaded=0
  if systemctl is-active --quiet nginx 2>/dev/null; then
    sudo nginx -t && sudo systemctl reload nginx && reloaded=1
  fi
  if systemctl is-active --quiet caddy 2>/dev/null; then
    sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy && reloaded=1
  fi
  if [ "$reloaded" -eq 0 ]; then
    log "WARN 未检测到运行中的 Nginx/Caddy，跳过 reload；请先完成端口探测并部署代理配置"
  fi
}

# ── Step 1 前置校验 ───────────────────────────────────────
log "Step 1/10 preflight"
sudo /usr/local/bin/rdpms-preflight.sh || die "preflight 未通过，中止发布"

# ── Step 2 发布前备份 ─────────────────────────────────────
log "Step 2/10 发布前备份"
sudo /usr/local/bin/rdpms-backup.sh predeploy || die "发布前备份失败，中止发布"

# ── Step 3 取码（SSH deploy key）──────────────────────────
log "Step 3/10 拉取代码 ${REPO}#${BRANCH} -> ${RELEASE_ROOT}"
sudo mkdir -p "$RELEASE_ROOT"
sudo chown -R "$RUN_USER":"$RUN_USER" "$RELEASE_ROOT"
as_user git clone --depth 1 -b "$BRANCH" "$REPO" "$RELEASE_ROOT" \
  || die "git clone 失败（请确认 /var/lib/rdpms/.ssh/id_ed25519 与 GitHub deploy key）"

# 仓库结构断言（已核实：Git 仓库根目录含 rdpms-system/ 子目录）
#   仓库根：.gitignore docs package-lock.json rdpms-system specs start-dev.sh
#   rdpms-system/：backend frontend README.md start-dev.sh start.sh stop.sh
# 若仓库结构变更，此处会立即失败，避免后续步骤静默跑到错误路径。
[ -d "$RELEASE_DIR" ] || die "未找到 ${RELEASE_DIR} —— 仓库根结构已变化？期望根目录下含 rdpms-system/"
for d in "$APP_DIR" "$WEB_DIR"; do
  [ -d "$d" ] || die "缺少目录 ${d} —— 请核对仓库结构与 deploy.sh 的路径假设"
done
log "仓库结构校验通过"

# ── Step 4 依赖安装 ───────────────────────────────────────
log "Step 4/10 npm ci"
( cd "$APP_DIR" && as_user npm ci )
( cd "$WEB_DIR" && as_user npm ci )

# ── Step 5 数据库迁移（先于切流，必须向后兼容）──────────────
log "Step 5/10 prisma migrate deploy"
( cd "$APP_DIR" && prisma generate && prisma migrate deploy && prisma migrate status )

# ── Step 6 Seed（仅首次联调显式开启）───────────────────────
if [ "$RUN_SEED" = "true" ]; then
  log "Step 6/10 seed（RUN_SEED=true）"
  # 使用 Prisma 标准入口：backend/package.json 已配置 "prisma": { "seed": "node prisma/seed.js" }
  # 后续 seed 若改为 TS/tsx，只需 DB 窗口改 package.json，本脚本无需变更
  ( cd "$APP_DIR" && sudo -u "$RUN_USER" env HOME="$RUN_HOME" /usr/local/bin/rdpms-env npx prisma db seed )
else
  log "Step 6/10 跳过 seed（RUN_SEED=false）"
fi

# ── Step 7 前端构建 ───────────────────────────────────────
log "Step 7/10 前端构建"
sudo tee "$WEB_DIR/.env.production" >/dev/null <<EOF
VITE_API_BASE_URL=/api
VITE_APP_NAME=R&D PMS
VITE_MAX_UPLOAD_MB=${MAX_UPLOAD_MB:-50}
VITE_AUTH_MODE=${VITE_AUTH_MODE:-cookie}
EOF
( cd "$WEB_DIR" && as_user npm run build )
[ -d "$WEB_DIR/dist" ] || die "前端构建产物缺失"

# ── Step 8 原子切流 ───────────────────────────────────────
log "Step 8/10 切换软链 -> ${REL}"
sudo ln -sfn "$RELEASE_ROOT" /opt/rdpms/current
printf 'release=%s\ncommit=%s\ntime=%s\n' "$REL" \
  "$(as_user git -C "$RELEASE_ROOT" rev-parse --short HEAD)" "$(date +%Y-%m-%dT%H:%M:%S%z)" \
  | sudo tee /opt/rdpms/.deploy-meta >/dev/null
sudo systemctl restart rdpms-api          # 必须 restart：symlink 路径需重新解析
reload_proxy

# ── Step 9 Smoke ─────────────────────────────────────────
log "Step 9/10 smoke（profile=${PROFILE}, env=${SMOKE_ENV}）"
# 说明：sudo 默认会剥离环境变量，故通过 `sudo env VAR=...` 显式传递
if ! sudo env SMOKE_ENV="$SMOKE_ENV" \
     SMOKE_ADMIN_USER="${SMOKE_ADMIN_USER:-}" SMOKE_ADMIN_PASS="${SMOKE_ADMIN_PASS:-}" \
     SMOKE_LOW_USER="${SMOKE_LOW_USER:-}"     SMOKE_LOW_PASS="${SMOKE_LOW_PASS:-}" \
     SMOKE_NONMEMBER_USER="${SMOKE_NONMEMBER_USER:-}" \
     SMOKE_NONMEMBER_PASS="${SMOKE_NONMEMBER_PASS:-}" \
     SMOKE_FOREIGN_PROJECT_ID="${SMOKE_FOREIGN_PROJECT_ID:-}" \
     /usr/local/bin/rdpms-smoke.sh --profile "$PROFILE"; then
  echo "[deploy] smoke 失败 —— 请按 §13 回滚方案处理；回滚决策人：郭博或指定总负责人" >&2
  exit 1
fi

# ── Step 10 清理旧 release ───────────────────────────────
log "Step 10/10 保留最近 ${KEEP_RELEASES} 个 release"
ls -1dt /opt/rdpms/releases/* 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r sudo rm -rf

log "发布完成: ${REL}"
log "建议观察 15 分钟：journalctl -u rdpms-api -f"
