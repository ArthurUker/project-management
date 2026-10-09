#!/usr/bin/env bash
#
# rdpms-deploy.sh —— 原地发布（foodsentinel 模式）
#
# 用法（以 ubuntu 身份执行；需要 sudo 的步骤脚本内部自行调用）
#   bash rdpms-system/deploy/scripts/rdpms-deploy.sh                  # 发布 origin/main 最新
#   bash rdpms-system/deploy/scripts/rdpms-deploy.sh <分支>           # 发布指定分支最新
#   bash rdpms-system/deploy/scripts/rdpms-deploy.sh --commit <sha>   # 部署指定提交（回退/复现用）
#   SKIP_INSTALL=1 ...  # 跳过依赖安装     SKIP_BACKUP=1 ...  # 跳过发布前备份（不推荐）
#   RDPMS_HEALTH_URL=...  # 覆盖健康检查地址（默认 http://127.0.0.1:3000/health）
#
# 流程
#   1 取码（fetch + ff-only merge；--commit 时改为检出指定提交）
#   2/3 依赖（package-lock 变化「或 node_modules 缺失」时才 npm ci）
#   4 发布前备份（rdpms-backup.sh predeploy，失败即中止）
#   5 Prisma Client 生成（不连库）
#   6/7 后端 / 前端构建
#   8 数据库迁移（migrate deploy）
#   9 重启服务 + active 校验 + HTTP 健康检查
#
# 顺序说明：迁移放在构建**之后** —— 构建失败时数据库不会被改动，可直接重试；
#   若先迁移再构建，一旦构建失败就会留下「已前滚的库 + 旧代码」这种最难处理的状态。
#
# 回退
#    bash .../rdpms-deploy.sh --commit <旧提交>
#
#   ⚠ 不要用「先 git checkout 旧提交、再直接跑本脚本」——本脚本默认第一步就是
#     fetch + merge origin/<分支>，会把刚检出的旧提交快进回最新，等于撤销回退。
#     回退必须走 --commit（它会跳过取码）。
#   ⚠ 迁移是前滚的：回退代码不会回退数据库结构。涉及数据语义的迁移需单独评估。
#
# 退出码：0 成功；非 0 表示在某一步中止（错误信息会指出是哪一步）。
set -Eeuo pipefail

APP="${RDPMS_APP_DIR:-/opt/rdpms/app}"
SERVICE="${RDPMS_SERVICE:-rdpms-api.service}"
BUILD="rdpms-system"
BACKUP_BIN="${RDPMS_BACKUP_BIN:-/usr/local/bin/rdpms-backup.sh}"
BRANCH="main"
TARGET_COMMIT=""

log() { printf '\n[deploy] %s\n' "$*"; }
die() { printf '[deploy][FATAL] %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --commit)
      TARGET_COMMIT="${2:-}"
      [ -n "$TARGET_COMMIT" ] || die "--commit 需要一个提交（sha / tag）"
      shift 2
      ;;
    --commit=*) TARGET_COMMIT="${1#*=}"; shift ;;
    -h|--help)
      printf 'rdpms-deploy.sh —— 原地发布\n\n'
      printf '  rdpms-deploy.sh                 发布 origin/main 最新\n'
      printf '  rdpms-deploy.sh <分支>          发布指定分支最新\n'
      printf '  rdpms-deploy.sh --commit <sha>  部署指定提交（回退），跳过取码\n\n'
      printf '环境变量：SKIP_INSTALL=1 跳过依赖安装；SKIP_BACKUP=1 跳过发布前备份；\n'
      printf '          RDPMS_HEALTH_URL 覆盖健康检查地址\n'
      exit 0
      ;;
    *) BRANCH="$1"; shift ;;
  esac
done

# Prisma 需要 DATABASE_URL 与 DIRECT_URL。生产配置在 /srv/rdpms/.env（root:rdpms 640），
# 以 ubuntu 身份运行本脚本时读不到，因此按需用 sudo 取这两项并导出到本进程环境 ——
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

# ── 1 取码 / 检出指定提交 ────────────────────────────────────────────────────
PREV="$(git rev-parse HEAD)"

if [ -n "$TARGET_COMMIT" ]; then
  log "1/9 部署指定提交（跳过取码）"
  git -c advice.detachedHead=false checkout --quiet "$TARGET_COMMIT" \
    || die "无法检出 $TARGET_COMMIT（检查提交是否存在、工作区是否干净）"
  NEW="$(git rev-parse HEAD)"
  printf '      %s -> %s  %s\n' "${PREV:0:8}" "${NEW:0:8}" "$(git log -1 --format=%s)"
  log "已进入 detached HEAD（这是回退/复现的正常状态）；恢复正常跟踪：git checkout $BRANCH"
else
  log "1/9 取码 origin/$BRANCH"
  git fetch origin "$BRANCH"
  git merge --ff-only "origin/$BRANCH" || die "无法快进合并（本地有未推送提交或分叉）"
  NEW="$(git rev-parse HEAD)"
  printf '      %s -> %s  %s\n' "${PREV:0:8}" "${NEW:0:8}" "$(git log -1 --format=%s)"
fi

if [ "$PREV" = "$NEW" ]; then
  log "代码无变化（$NEW），仍会重新构建并重启"
fi

# 依赖是否需要重装：lockfile 在本次变更中改过，**或** node_modules 根本不存在。
# 后者覆盖「上次安装失败、这次 lockfile 没变」的情形，否则会一直跳过安装。
needs_install() {
  local lock="$1"
  local dir="${lock%/package-lock.json}"
  [ "${SKIP_INSTALL:-0}" = "1" ] && return 1
  [ -d "$dir/node_modules" ] || return 0
  [ "$PREV" = "$NEW" ] && return 1
  ! git diff --quiet "$PREV" "$NEW" -- "$lock"
}

# ── 2/3 依赖 ────────────────────────────────────────────────────────────────
if needs_install "$BUILD/backend/package-lock.json"; then
  log "2/9 后端依赖（npm ci）"
  ( cd "$BUILD/backend" && npm ci --no-audit --no-fund )
else
  log "2/9 后端依赖：lockfile 未变且 node_modules 存在，跳过"
fi

if needs_install "$BUILD/frontend/package-lock.json"; then
  log "3/9 前端依赖（npm ci）"
  ( cd "$BUILD/frontend" && npm ci --no-audit --no-fund )
else
  log "3/9 前端依赖：lockfile 未变且 node_modules 存在，跳过"
fi

# ── 4 发布前备份 ────────────────────────────────────────────────────────────
# 迁移一旦执行就是前滚的，因此进入 Prisma 步骤前必须有可用备份；备份失败即中止。
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  log "4/9 发布前备份：已按 SKIP_BACKUP=1 跳过（请自行确认已有可用备份）"
# 注意：用 sudo 探测可执行位 —— 该脚本是 root:rdpms 750，以 ubuntu 身份做 -x 判断必然失败。
elif sudo -n test -x "$BACKUP_BIN" 2>/dev/null; then
  log "4/9 发布前备份（$BACKUP_BIN predeploy）"
  sudo "$BACKUP_BIN" predeploy || die "备份失败，已中止发布（确认无需备份可加 SKIP_BACKUP=1）"
else
  log "4/9 发布前备份：$BACKUP_BIN 不存在或经 sudo 也不可执行，跳过（请自行确认已有可用备份）"
fi

# ── 5 Prisma Client 生成（只读 schema，不连库）──────────────────────────────
log "5/9 Prisma Client 生成"
load_db_env
( cd "$BUILD/backend" && npx --no-install prisma generate )

# ── 6/7 构建 ────────────────────────────────────────────────────────────────
log "6/9 后端构建（tsc -> dist）"
( cd "$BUILD/backend" && npm run build )
[ -f "$BUILD/backend/dist/index.js" ] || die "后端构建产物缺失：$BUILD/backend/dist/index.js"

log "7/9 前端构建（tsc -b && vite build）"
( cd "$BUILD/frontend" && npm run build )
[ -f "$BUILD/frontend/dist/index.html" ] || die "前端构建产物缺失：$BUILD/frontend/dist/index.html"

# ── 8 数据库迁移 ────────────────────────────────────────────────────────────
# 放在构建之后：构建已成功才动数据库。迁移本身仍是前滚的，失败不会自动撤销。
log "8/9 数据库迁移（prisma migrate deploy）"
( cd "$BUILD/backend" && npx --no-install prisma migrate deploy )
unset DATABASE_URL DIRECT_URL

# ── 9 重启与验收 ────────────────────────────────────────────────────────────
log "9/9 重启 $SERVICE 并验收"
sudo systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE" || die "服务未处于 active，请查看 journalctl -u $SERVICE -n 50"

# active 只说明进程在跑；这里再对业务健康端点做一次真实请求确认（最多等 20 秒）。
HEALTH_URL="${RDPMS_HEALTH_URL:-http://127.0.0.1:3000/health}"
code="000"
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" 2>/dev/null || echo 000)"
  [ "$code" = "200" ] && break
  sleep 1
done
if [ "$code" != "200" ]; then
  die "服务已 active 但健康检查失败：$HEALTH_URL → HTTP $code（查看 /mnt/datadisk0/rdpms/logs/app.err.log）"
fi

printf '[deploy] %s 已重启：active + 健康检查 200（%s）\n' "$SERVICE" "$HEALTH_URL"
log "完成：HEAD=$(git rev-parse --short HEAD) $(git log -1 --format=%s)"
