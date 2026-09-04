# PostgreSQL 初始化说明（DB 窗口交付）

适用范围：R&D PMS 的 PostgreSQL-only 重构。本文只覆盖**数据库与角色初始化**，应用部署见 `linux-production.md`（运维窗口）。

---

## 1. 版本要求

| 项目 | 要求 |
|---|---|
| PostgreSQL | **14+，推荐 15+**（本机验证环境：PostgreSQL 18.4） |
| Prisma | **锁定 5.22.x**，本轮不升级 Prisma 6 |
| 扩展 | `pgcrypto`（trusted，PG13+ 可由 DB owner 创建）；`pg_trgm` 仅在需要模糊检索时启用 |

---

## 2. 角色分离（生产必须）

| 角色 | 用途 | 权限 |
|---|---|---|
| `rdpms_migrate` | `prisma migrate` / seed | 数据库 owner，拥有 DDL 权限 |
| `rdpms_app` | 应用运行期 | 仅 DML（SELECT/INSERT/UPDATE/DELETE） |

> 若部署暂时无法支持双角色，可先用单角色 `rdpms`，但**正式上线前必须补齐**。
> 单角色时 `DATABASE_URL` 与 `DIRECT_URL` 填同一个连接串即可。

---

## 3. 初始化脚本（生产，不销毁已有数据）

以超级用户执行：

```sql
-- 用强密码替换 <migrate_pwd> / <app_pwd>
CREATE ROLE rdpms_migrate LOGIN PASSWORD '<migrate_pwd>';
CREATE ROLE rdpms_app     LOGIN PASSWORD '<app_pwd>';

CREATE DATABASE rdpms
  OWNER rdpms_migrate
  ENCODING 'UTF8'
  TEMPLATE template0;

\connect rdpms

GRANT CONNECT ON DATABASE rdpms TO rdpms_app;
GRANT USAGE  ON SCHEMA public TO rdpms_app;

-- 未来由 rdpms_migrate 创建的表/序列自动授予 app 的 DML 权限
ALTER DEFAULT PRIVILEGES FOR ROLE rdpms_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rdpms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rdpms_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rdpms_app;
```

> **不要给 `rdpms_migrate` 加 `CREATEDB`**。
> `CREATEDB` 仅本地开发需要——`prisma migrate dev` 要建立 shadow database；
> 生产使用 `prisma migrate deploy`，不需要 shadow database。

---

## 4. 本地开发初始化（含销毁重建）

```bash
psql "postgresql://postgres:<pwd>@127.0.0.1:5432/postgres" -q -f /tmp/rdpms-init.sql
```

其中 `/tmp/rdpms-init.sql` 内容：先 `DROP DATABASE IF EXISTS rdpms` / `DROP ROLE IF EXISTS rdpms_app|rdpms_migrate`，
再执行第 3 节脚本，并为 `rdpms_migrate` 追加 `CREATEDB`。

---

## 5. 连接串

```bash
# 应用运行期（rdpms_app，仅 DML）
DATABASE_URL="postgresql://rdpms_app:<pwd>@127.0.0.1:5432/rdpms?schema=public&connection_limit=10&pool_timeout=20"

# 迁移 / seed（rdpms_migrate，DDL）
DIRECT_URL="postgresql://rdpms_migrate:<pwd>@127.0.0.1:5432/rdpms?schema=public"
```

- `DATABASE_URL` 与 `DIRECT_URL` **都必须配置**，`schema.prisma` 中两个 `env()` 缺一即启动失败。
- 生产建议追加 `sslmode=require`；若前面挂 PgBouncer，追加 `pgbouncer=true` 并让 `DIRECT_URL` 绕过连接池直连。
- 5432 **不得对公网开放**。

---

## 6. 迁移与 seed

```bash
cd rdpms-system/backend

# 生产（禁止使用 db push）
npm run db:migrate:deploy
npm run db:generate
npm run db:seed

# 本地开发
npm run db:migrate          # 交互式建迁移
npm run db:migrate:status   # 确认 up to date
npm run db:seed             # 幂等，可重复执行
```

---

## 7. 备份（运维窗口负责）

- 应用层**不提供** restore 能力（已删除 `/api/backup/restore`）。
- 备份方式：`pg_dump` + WAL/PITR。
- 恢复演练至少成功一次后方可上线。

```bash
pg_dump -h 127.0.0.1 -U rdpms_migrate -d rdpms -Fc -f /var/backups/rdpms/rdpms-$(date +%F).dump
```
