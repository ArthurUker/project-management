#!/usr/bin/env bash
#
# rdpms-start.sh —— 生产启动入口（systemd ExecStart 指向本文件）
#
# 形态（2026-10-08 改造为原地部署）
#   运行目录固定为 /opt/rdpms/app，不再有 releases/<ts> 与 current 软链。
#   发布 = git pull + 依赖 + prisma migrate deploy + build + restart（见同目录 rdpms-deploy.sh）。
#
# 为什么只认 dist，不做 src 回退
#   后端入口是 TypeScript 构建产物 dist/index.js。src/ 下是 .ts 源码，node 无法直接执行 ——
#   旧脚本那层 src 回退是为「2026-09-15 之前、src 还是 .js」的更早 release 准备的，那些版本
#   已经不存在，保留只会把「构建没跑」这种部署事故静默降级成一个更难排查的启动错误。
#   所以 dist 缺失 = 部署事故：直接失败并给出可执行的提示。
#
# 安装（改本文件后必须重装）
#   sudo cp rdpms-system/deploy/scripts/rdpms-start.sh /usr/local/bin/rdpms-start.sh
#   sudo chown root:rdpms /usr/local/bin/rdpms-start.sh
#   sudo chmod 750 /usr/local/bin/rdpms-start.sh
#   sudo systemctl daemon-reload && sudo systemctl restart rdpms-api
#
set -Eeuo pipefail

APP_DIR="${RDPMS_APP_DIR:-/opt/rdpms/app/rdpms-system/backend}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"   # 服务器上 Node 在此（/usr/bin/node 不存在）

[ -d "$APP_DIR" ] || { printf '[rdpms-start] FATAL: 缺少运行目录 %s\n' "$APP_DIR" >&2; exit 1; }
[ -x "$NODE_BIN" ] || { printf '[rdpms-start] FATAL: 缺少 node：%s\n' "$NODE_BIN" >&2; exit 1; }
if [ ! -f "$APP_DIR/dist/index.js" ]; then
  printf '[rdpms-start] FATAL: 缺少构建产物 %s/dist/index.js\n' "$APP_DIR" >&2
  printf '[rdpms-start]        请先执行：bash %s/../deploy/scripts/rdpms-deploy.sh\n' "$APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"
exec "$NODE_BIN" "$APP_DIR/dist/index.js"
