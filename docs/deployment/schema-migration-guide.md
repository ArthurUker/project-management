# 当前数据库迁移约束

更新：2026-10-09。PostgreSQL-only；源为 backend/prisma/schema.prisma 与 migrations/。

- 模型变更必须有版本化 SQL 迁移，并检查自定义 trigger/function/index 与数据兼容性。
- 本地开发生成迁移与生产 migrate deploy 是不同操作；禁止对现有生产库使用 db push、reset 或演示 seed。
- 当前发布脚本先 generate/migrate deploy，再构建。构建失败不撤销已执行 DDL，数据库小也不代表锁等待可忽略。
- 生成的 Prisma Client 必须与 schema 对齐；lockfile 没变不代表 client 已更新。
- additive 迁移仍可能改变旧应用语义；安全版本、epoch、restore gate 和同步日志需逐项核对。
- 恢复必须同时考虑数据库、文件、安全凭据和数据代际；不提供直接覆盖生产库的简化命令。

部署入口见 [deploy-guide.md](./deploy-guide.md)；基线自定义对象说明仍保留于 [postgres-baseline.md](../refactor/postgres-baseline.md)。
旧 SQLite 事故复盘已从当前操作文档中移除，见 [清理记录](../maintenance/2026-10-09/REVIEW.md)。
