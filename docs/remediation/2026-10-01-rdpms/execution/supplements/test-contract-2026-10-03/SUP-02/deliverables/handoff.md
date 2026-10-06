# SUP-02 交接（待独立审阅）

- 父任务：RP08-T01（LR4-02 / B04），模式 TEST_ONLY。
- 交付：本目录 authorization / change-summary / acceptance / field-comparison / rollback / task-state / handoff + evidence/。
- 测试文件：`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
  （本轮新增 `extractOnlineRow` 与七实体精确行/字段键-值对照用例，原有 B1–B5 不变）。
- 运行：自有 loopback PostgreSQL + 唯一 guard 认可测试库（独立新库）；`12/12` 通过。
- 关键结论：七实体普通 API 与同步同属同一真实活跃行，逐键逐值相等，禁止字段不存在；移除读权限后普通 API 403、同步对应 upserts/tombstones 空。
- 未改动同步投影、权限、普通 API、前端；当前普通 API 对照不是独立产品或安全政策批准，发布保持 NOT_EVALUATED，交由独立审阅裁定。
