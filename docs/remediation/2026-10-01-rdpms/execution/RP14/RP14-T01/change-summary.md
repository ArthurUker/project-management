# RP14-T01 — 感染文件字节出口统一阻断

- 关联历史发现：B11 (P1, SUPPORTED；未 FIX_ACCEPTED)。
- 实施基线：HEAD `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`；`files.js` 与 `regulatory-documents.js` 在本任务开始时与 HEAD 相同；新建共享 guard 和集成用例。
- 代码变化：新建 `fileReadService.ts` 作为 FileObject 字节出口共用感染判定；`GET /api/files/:id`、`GET /api/files/:id/download` 原有共同处理器调用 guard；`GET /api/regulatory-documents/:id/original-file` 在附件授权后、读字节前调用 guard，对感染拒绝写下载审计并返回403。
- 允许源码文件：`rdpms-system/backend/src/routes/files.js`、`rdpms-system/backend/src/routes/regulatory-documents.js`、`rdpms-system/backend/src/modules/files/fileReadService.ts`；验收测试：`rdpms-system/backend/tests/integration/rp14-infected-file-read.integration.test.mjs`。
- API/schema：URL、正常内容响应和 schema 均未改变；无数据库迁移。新增拒绝路径对 infected alias 返回403。
- 安全边界：只实现明确要求的 INFECTED 无条件阻断。FAILED/SKIPPED/PENDING 策略仍由 T-RP-05 决定，本任务未更改其现有行为。没有 FileObject/scanStatus 的早期 `uploads/regulatory-documents` legacy 回退仍未纳入扫描策略，需后续明确归档/扫描规则。
- 任务内动态验收未运行：`tsc` 不存在，隔离 PostgreSQL 与 task-owned UPLOAD_DIR 未配置；详情见 evidence。
