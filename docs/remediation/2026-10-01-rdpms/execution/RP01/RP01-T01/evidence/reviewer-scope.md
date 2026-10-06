# RP01-T01 变更边界核对

- `roles.js` 是唯一跟踪业务源码变化；新增一个本任务允许的测试文件。
- `kernel/massAssign.js` 与 `kernel/constants.js` 未修改；`code` 仍在 `GLOBAL_FORBIDDEN_FIELDS`。
- Prisma schema/migration、seed、RBAC 权限定义、用户账号、session/auth token policy 均未修改。
- 未激活 D-S01-01/02/03 控制的账号重置、强制改密、自定义角色绑定范围。RP01-T01 在 TASK_GRAPH 无待批准业务门禁。
- 旧 finding B17 `SUPPORTED` 和原审计证据保持不变；本地修复验收通过不关闭 B01 或31个历史开放项。
