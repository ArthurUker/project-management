# RP08-T01 补验 — 回滚说明

## 本地变更撤销

本任务未修改业务代码，只需回退测试与本 run 的证据文件：

1. `rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
   - 删除本轮新增的 6 个 test 块（B1、B1b、B2、B3、B4、B5）与 helper
     （`apiGet`、`pullWith`、`collectIds`、`rowIdsOf`、`ORDINARY_PAIRS`），
     以及"LR3-02 补验 B1–B5"注释块；保留既有 5 个用例与上一轮的矩阵用例。
2. 删除本 run 目录中的 `read-contract-matrix.csv`、`read-contract-matrix.md`（仅本轮产物）。

## 数据与 schema

- 无迁移、无字段变化；所有夹具行只存在于自有一次性 `rdpms_test_*` 库（已 guard drop、集群已停止）。
- B1b 会临时把成员资格置为 leftAt 并在用例内复原；整库随 runner 清理。
- append-only 审计（普通 API 的 elevated 审计）不删除、不关闭 trigger；合成 actor 保留到整库 drop。

## 安全边界

- 撤销只影响测试覆盖，不改变任何运行时行为。
- 生产/目标环境回退演练未执行 → `NOT_RUN`；未提交、未部署。
