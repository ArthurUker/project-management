# SUP-02 回滚说明

本轮仅新增测试代码，未改动业务源码、同步投影、权限、普通 API 或前端。
若需回滚，移除 `rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs` 中本轮追加的段落：

- 删除 `extractOnlineRow` 辅助（约行 611-619）
- 删除 `test('RP08 LR4-02 SUP-02 ...')`（约行 629 至文件末尾）

删除后文件回到本轮前状态（既有 B1–B5 不变）。请勿对未跟踪测试文件执行 `git checkout/restore` 覆盖既有未提交改动。
