#!/usr/bin/env bash
#
# rdpms-start.sh —— 生产启动入口包装（systemd ExecStart 指向本文件）
#
# 为什么需要它
#   v2 ADR-02 起（2026-09-15）后端入口是构建产物 dist/index.js；而更早的 release
#   没有 dist，入口是 src/index.js。若单元写死其中一个，另一个 release 一起必崩：
#   2026-09-28 曾因单元仍指向 src/index.js 发布重构版 release，导致
#   `ERR_MODULE_NOT_FOUND: src/modules/access/editPolicy.js` 反复重启、生产中断。
#
# 行为
#   - 存在 dist/index.js（构建产物）→ 用它（当前 release 的正常路径）
#   - 否则回落 src/index.js（2026-09-15 之前的旧 release，回退时无需改单元）
#
# 安装（改本文件后必须重装，与其它 /usr/local/bin/rdpms-*.sh 同规矩）
#   sudo cp rdpms-system/deploy/scripts/rdpms-start.sh /usr/local/bin/rdpms-start.sh
#   sudo chown root:rdpms /usr/local/bin/rdpms-start.sh && sudo chmod 750 /usr/local/bin/rdpms-start.sh
#   sudo systemctl daemon-reload && sudo systemctl restart rdpms-api
#
set -Eeuo pipefail

APP_DIR="/opt/rdpms/current/rdpms-system/backend"
NODE_BIN="/usr/local/bin/node"   # 服务器上 Node 在此（/usr/bin/node 不存在）

[ -d "$APP_DIR" ] || { printf '[rdpms-start] FATAL: 缺少 %s\n' "$APP_DIR" >&2; exit 1; }
[ -x "$NODE_BIN" ] || { printf '[rdpms-start] FATAL: 缺少 %s\n' "$NODE_BIN" >&2; exit 1; }

cd "$APP_DIR"
if [ -f "$APP_DIR/dist/index.js" ]; then
  printf '[rdpms-start] 使用构建产物 dist/index.js (%s)\n' "$APP_DIR"
  exec "$NODE_BIN" "$APP_DIR/dist/index.js"
fi

printf '[rdpms-start] 未发现 dist/index.js，回落 src/index.js (%s)\n' "$APP_DIR"
exec "$NODE_BIN" "$APP_DIR/src/index.js"
