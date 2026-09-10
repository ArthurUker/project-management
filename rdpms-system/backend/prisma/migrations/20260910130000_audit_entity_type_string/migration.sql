-- 审计判别字段去枚举约束（实机部署发现：代码使用 13 个不在 EntityType 枚举内的实体类型，
--   DOC / REAGENT_MATERIAL / BACKUP / TASK_TEMPLATE / PROJECT_TEMPLATE / ROLE / FILE / AUDIT_LOG 等，
--   写审计时抛 PrismaClientValidationError → 相关端点 500）。
-- 与 AuditLog.action 的策略保持一致：审计判别字段用字符串，展示标签走 EnumMeta。
-- 注意：Attachment.entityType 仍保留 EntityType 枚举（附件值域受控）。

ALTER TABLE "audit_logs"
  ALTER COLUMN "entity_type" TYPE VARCHAR(64) USING "entity_type"::text;
