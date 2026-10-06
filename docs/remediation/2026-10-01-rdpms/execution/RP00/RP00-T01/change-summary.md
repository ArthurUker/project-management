# RP00-T01 — 基线与验证前提

- 子任务状态：implementation COMPLETE；validation ENV_BLOCKED（full PC09 build/candidate gate）；release NOT_EVALUATED。RP00 整包仍 IN_PROGRESS。
- 原审计基线及本轮起始 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。
- 先前执行记录不存在；原工作区仅有 `?? docs/audits/` 与 `?? docs/remediation/`，`rdpms-system/` 起始无跟踪差异。
- 本轮授权 taskIds：RP00-T01、RP01-T01。执行者为 Codex；执行授权不等于产品/安全规则批准。
- 记录允许源文件 `rdpms-system/backend/src/routes/roles.js`、单个 B17 测试文件、授权目录 execution 产物；未触碰冻结审计文件、v1 快照或业务迁移。
- 新建 owner 为 `renkang`、仅绑定 `127.0.0.1` 的 PostgreSQL 18.4 私有集群与随机 `rdpms_test_*` 数据库。受守卫 reset/seed，合成 SUPER_ADMIN 登录并确认 `roles.create` 权限。口令只存于 checkout 外 chmod 0600 临时 env 文件，已删除。
- 33 条发现/候选均有唯一有效主包；31 个历史开放项仍 OPEN 且均有解除条件。R09历史 startHead 仍无法恢复，保留 `UNKNOWN_NOT_RECORDED`；S00-OI-01 不阻塞业务子任务。
- 关闭临时数据库和专属 PostgreSQL 进程，删除本轮精确临时目录。命令和证据见 `evidence/`。
