# RP04-T02 返工 — 回滚说明

## 本地变更撤销（未提交）

1. `rdpms-system/backend/src/routes/projects.js`
   - 删除 `validateProjectCreateCommand` 开头的 `assertTopLevelProjectScalars(raw);` 调用；
   - 可一并删除本轮新增的 `TOP_LEVEL_STRING_FIELDS` / `assertTopLevelScalar` / `parseTopLevelDate` / `assertTopLevelProjectScalars` 四个函数（它们未被其它调用者引用）。
2. `rdpms-system/backend/tests/integration/rp04-project-create-aggregate.integration.test.mjs`
   - 删除本轮新增的两个用例："accepts valid top-level scalars…" 与 "rejects malformed top-level scalars…"（保留原有 3 个用例）。

注意：这些文件同时含上一轮连续执行的未提交改动，**不能**用 `git checkout` 回退到 HEAD，否则会一并丢失上一轮工作。

## 数据与 schema

- 无迁移、无字段/结构变化；运行副作用只在自有一次性 `rdpms_test_*` 库（已 guard drop、集群已停止）。
- 撤销后回到"顶层对象/数组/boolean 日期产生 500 或静默落库"的既有缺陷状态，仅可用于本地对照，不是可发布的安全旧版本。

## 安全边界

- 生产/目标环境回退演练未执行 → `NOT_RUN`。
- 未提交、未部署；不存在可申请的发布回退动作。
