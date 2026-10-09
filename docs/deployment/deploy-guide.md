# 当前部署指南

更新：2026-10-09。依据提交 `f8ccb06` 及当前脚本；本轮未连接服务器。

## 当前入口

- 运行形态：`/opt/rdpms/app` 原地部署，PostgreSQL、systemd、Caddy。
- 服务：`rdpms-api.service`；systemd 注入 `/srv/rdpms/.env`。
- 发布脚本：`rdpms-system/deploy/scripts/rdpms-deploy.sh`。
- 启动脚本：`rdpms-system/deploy/scripts/rdpms-start.sh`；仅启动后端 `dist/index.js`，不检查旧 release manifest。
- 完整目录、服务模板及配置见 [README §8](../../README.md#8-部署架构)。

## 实际发布步骤与边界

脚本依次 fetch/ff-only merge → 按 lockfile 差异决定 npm ci → Prisma generate/migrate deploy → 后端构建 → 前端构建 → 重启 → systemd active。

该流程不会自动备份、停写、运行测试或核对 HTTP health/ready。依赖缺失而 lockfile 未变时也不会自动安装。
`SKIP_INSTALL=1` 只跳过依赖安装，不跳过迁移、构建和重启。
构建在运行目录内进行，前端静态文件与后端依赖/数据库可能在服务重启前已变化，不能声称原子发布。
旧 RP18 deploy.sh/preflight/candidate/deploy-control 仍在仓库供专项测试使用，但不是当前生产入口。

操作前应明确目标提交、当前工作区、依赖、备份及失败处置；本文件不是执行授权。
现有库不得套用旧指南的 SQLite 切换、db push --accept-data-loss、演示 seed 或弱口令初始化步骤。

## 回退

当前脚本没有固定提交回退模式。checkout 旧提交后再次运行脚本，会重新合入 origin/main，不能作为回退方法。
迁移前滚不等于旧代码兼容；需要专项兼容性与恢复方案。不得用直接 pg_restore 覆盖生产库替代恢复演练。

## 尚未完成

见 [当前待办](../review/codebuddy/deepseek/open-items.md)。服务器实际部署状态来自执行者记录，本轮未重新进行线上验收。
