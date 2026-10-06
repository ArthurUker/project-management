# RP08-T01 补验 — 回滚说明

## 本地变更撤销

本任务**未修改任何业务源文件**，只新增/修正测试。撤销方式：删除
`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs` 中本轮新增内容：

- 覆盖边界注释块；
- `SYNC_READ_MATRIX` / `ALL_READ_PERMISSIONS` / `buildMatrixFixtures` / `actorFor` / `scopedTo`；
- 4 个新用例（逐权限门禁、字段投影、角色范围矩阵、elevated own-only）。

既有 1 个用例（含其 member/other/outsider 夹具）保持不变。

## 数据与 schema

- 无迁移、无字段变化；运行副作用只在自有一次性 `rdpms_test_*` 库（已 guard drop、集群已停止）。
- 本轮夹具行（rp08m-* 用户/项目/子行）随整库 drop 清理，不做行级删除，避免与 append-only 审计/外键冲突。

## 安全边界

- 撤销只影响测试覆盖，不改变任何运行时行为。
- 生产/目标环境回退演练未执行 → `NOT_RUN`；未提交、未部署。
