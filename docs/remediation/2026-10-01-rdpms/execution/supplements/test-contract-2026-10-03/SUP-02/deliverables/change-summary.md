# SUP-02 变更摘要（TEST_ONLY，业务源码零改动）

- 父任务：RP08-T01（LR4-02 / B04）
- 模式：TEST_ONLY —— 仅修改白名单测试文件 `tests/integration/rp08-sync-read-authorization.integration.test.mjs`
- 执行日期：2026-10-03，本地隔离（自有 loopback PostgreSQL + 唯一 guard 认可测试库）

## 改动内容（测试增量）

新增 `extractOnlineRow(body, id)` 辅助（兼容裸数组 / `{list}` / 单对象响应形态），并新增：

`test('RP08 LR4-02 SUP-02 exact-row field key/value comparison for all seven entities, plus permission denial')`（约行 629-~710）

对七实体逐个：
1. 同一真实 actor（member + 该实体读权限），先成对请求普通 API 与同步 init；
2. 从普通 API 真实响应按指定 ID 提取目标**活跃**行（过滤 deletedAt/leftAt，避免取到 B3 软删墓碑行）；
3. 断言同步 upserts 含同一 ID 的真实行；
4. **逐键逐值比较**：每个同步键必须属于同一在线行；标量/数组逐项 `deepEqual`；`manager` 等较窄嵌套投影逐键比较在线同一对象；
5. 按 `SYNC_READ_MATRIX[entity].forbidden` 断言禁止字段（createdById/updatedById/deletedAt/reviewerId/leftAt/metadata 及不应嵌入的任务关系等）不存在；
6. 移除该实体读权限（zero 用户）后，普通 API 返回 `403`，同步对应 `upserts` 与 `tombstones` 为空。

## 保留项
- 原有 B1–B5 全部保留且断言不变（含 B5 的 JSON 子串存在性检查，作为历史记录保留）；整个同步正式套件一并运行。
- 不改同步投影、权限、普通 API、前端；不削弱既有禁止字段/关系检查。

## 验证
- 运行器：`run-suite.py`（本 session 新建），独立新库。
- 结果：`12/12` 通过（原 11 + 新增 1）。详见 `evidence/run-reference.md` 与 `field-comparison.md`。
