# SUP-01 回滚说明

本轮仅新增测试代码（helper + 2 个用例），未改动业务源码、schema、迁移、helper 或前端。
若需回滚，只需移除 `rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs` 中本轮追加的段落：

- 删除 `gateOnReportMethods` helper 定义（约行 762-816）
- 删除 `test('RP10 LR4-03 SUP-01-01 ...')`（约行 818-865）
- 删除 `test('RP10 LR4-03 SUP-01-03 SEMANTIC_NEGATIVE_CONTROL ...')`（约行 867 至文件末尾）

删除后文件回到本轮前状态（既有 A01–A06b 不变）。请勿对未跟踪测试文件执行 `git checkout/restore` 覆盖既有未提交改动。
