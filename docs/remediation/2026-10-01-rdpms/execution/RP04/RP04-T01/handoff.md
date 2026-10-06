# RP04-T01 接续交接 — 2026-10-02

实现已落盘；B03/B20相关测试因本地 `tsc` 缺失和无隔离DB而 ENV_BLOCKED，尚不可标 FIX_ACCEPTED。恢复后先建本轮专属 PostgreSQL/私有env，再build当前候选，运行 `tests/integration/rp04-project-snapshot-active.integration.test.mjs`，检查真实 list total/groupBy、project状态、phase plannedStart及清理，最后drop该专属DB。

下一按implementation dependencies执行 RP04-T02 的静态/实现准备；其 acceptanceDependency RP09-T01 只阻止验证，不能误作 implementation 顺序依赖。RP04-T02 的PC03/receipt范围需继续按批准门禁判断，不得代签或把复用静态证据当产品验收。
