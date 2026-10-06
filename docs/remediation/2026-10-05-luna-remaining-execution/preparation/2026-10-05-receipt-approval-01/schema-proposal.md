# Additive schema 提案（本轮未改 schema/未创建 migration）

仅在 SyncMutation 增加 `receiptVersion Int?`、`resourceScope String? @db.VarChar(200)`、`payloadHash String? @db.Char(64)`、`expiresAt DateTime? @db.Timestamptz(3)`，各自映射 receipt_version/resource_scope/payload_hash/expires_at。字段无回填默认，旧行保持 null。复用 userId/deviceId/id；clientMutationId 全局唯一保留，status 现有 String 增 pending 即可；不新建表、不删索引、不改 User/Device cascade。

未来获准后新文件只允许 `backend/prisma/migrations/20261005_sync_receipt_v1_scope/migration.sql`。创建前确认路径未被他人占用。迁移仅使用自有空库/合成 legacy 行验证 null 保留、约束与新 ORM 编译。现有 applied/null 行绝不补造历史请求 hash 或从迁移时刻续命。

DDL 锁/目标容量/发布窗口未测；不在真实环境执行。未提供生产清理频率或最大数据量预算，本地禁止删 receipt 不能被表述为成熟运维留存策略。代码回滚保留列与行，停止受影响写；不执行 destructive down migration。
