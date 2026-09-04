# PostgreSQL Baseline 迁移说明（DB 窗口交付）

本文记录本次「推倒重建」的 baseline 迁移是如何产生的、包含哪些手工补充内容，以及后续维护规则。

---

## 1. 本次做了什么

| 项 | 处置 |
|---|---|
| 旧 `prisma/migrations/`（9 个 SQLite 迁移） | **删除**（已先打 `archive/sqlite-eol` tag 前应先提交；未提交则可从 git 历史恢复） |
| `prisma/dev.db`、`prisma/prisma/rdpms.db` | **删除**，不做任何数据迁移 |
| 旧 provider | `sqlite` → `postgresql` |
| 新 baseline | `prisma/migrations/20260902085743_init_postgres/migration.sql` |
| SQLite 审计 / 补丁脚本 | **全部删除** |

---

## 2. Baseline 生成步骤（可复现）

```bash
cd rdpms-system/backend

# 1) 校验
npx prisma validate && npx prisma format

# 2) 只生成 SQL，人工审阅后再应用
npx prisma migrate dev --name init_postgres --create-only

# 3) 在生成的 migration.sql 末尾追加「手工补充部分」（见第 3 节）

# 4) 应用
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

> 若需要重建 baseline（例如枚举调整）：
> ```bash
> psql "$DIRECT_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"   # 再补第 4 节授权
> rm -rf prisma/migrations
> npx prisma migrate dev --name init_postgres --create-only
> # 重新追加手工补充部分
> npx prisma migrate deploy
> ```

---

## 3. migration.sql 中的「手工补充部分」

Prisma Schema 无法表达以下对象，已手写追加在 `migration.sql` 末尾。
**这些是 DB 窗口资产，禁止被 `prisma migrate dev` 自动生成的内容覆盖。**

| # | 内容 | 作用 |
|---|---|---|
| 1 | `CREATE EXTENSION pgcrypto` | 供后续 `gen_random_uuid()` 等使用 |
| 2 | `users_username_lowercase_chk` | 账号名规范化，大小写不产生第二个身份 |
| 3 | 百分比 CHECK（project_phases / tasks / monthly_progress） | 取值域 0–100 |
| 4 | 日期区间 CHECK（projects / project_phases / tasks） | 结束日期不得早于开始日期 |
| 5 | 图结构自引用 CHECK（task_dependencies / phase_transitions） | 禁止自环 |
| 6 | `file_objects_size_chk`、`reagent_materials_purity_chk` | 数值合理性 |
| 7 | 5 个部分索引（`WHERE deleted_at IS NULL`） | 软删除高频查询 |
| 8 | `doc_documents_tags_gin_idx`（GIN on text[]） | 标签检索 |
| 9 | `audit_logs` 只追加触发器（UPDATE / DELETE 均抛异常） | 合规：审计不可篡改 |
| 10 | `audit_logs_after_gin_idx`（GIN jsonb_path_ops） | 审计内容检索 |

> `pg_trgm` 已在 SQL 中保留为注释，**仅在确认需要中文模糊检索时启用**，并配合 `gin_trgm_ops` 索引。

---

## 4. 每次新增迁移后的回归检查

Prisma 不认识 CHECK / 部分索引 / 触发器 / RULE，因此 `migrate dev` 不会主动删除它们；
但**必须在每次新增迁移后人工确认这些对象仍存在**：

```sql
SELECT count(*) FROM pg_constraint WHERE contype='c';                      -- 期望 >= 13
SELECT count(*) FROM pg_indexes WHERE indexdef ILIKE '%WHERE%';            -- 期望 >= 5
SELECT count(*) FROM pg_indexes WHERE indexname LIKE '%gin%'
  AND schemaname='public';                                                  -- 期望 >= 2
SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'audit_logs%';           -- 期望 = 2
SELECT count(*) FROM information_schema.columns
  WHERE table_schema='public' AND data_type='timestamp without time zone'; -- 必须 = 0
```

> 若未来 Prisma 版本开始 diff CHECK 约束，应把这些对象拆到独立的、
> 永不重新生成的迁移文件（如 `migrations/<ts>_zz_constraints/migration.sql`）。

---

## 5. 已验证的 baseline 事实（PostgreSQL 18.4 实测）

| 指标 | 数值 |
|---|---|
| 业务表 | 42（+ `_prisma_migrations` = 43） |
| 枚举类型 | 36 |
| 外键 | 64（CASCADE 27 / RESTRICT 12 / SET NULL 25） |
| 唯一约束 | 48 |
| CHECK 约束 | 13 |
| 部分索引 | 5 |
| GIN 索引（业务） | 2 |
| 审计只追加触发器 | 2 |
| `timestamptz` 列 | 93 |
| **裸 `timestamp` 列** | **0** |
| `jsonb` 列 | 10 |
| `date` 列 | 23 |
| `numeric` 列 | 12 |

---

## 6. 迁移纪律

1. **生产只用 `prisma migrate deploy`**；`db push` 仅限本地临时库（已弱化为 `db:push:local-only`）。
2. 不使用 `prisma migrate resolve --applied`——那是「已有库缺迁移表」的补丁，全新库无需它。
3. 每个迁移必须向后兼容，或显式排期：
   - 加可空列 / 加带默认值列 → 安全；
   - 删列 / 改类型 / 改枚举值 → 需 expand-contract + 独立 PR + 停机评估。
4. 迁移文件必须与代码同 PR 提交；`.gitignore` 已显式放行 `backend/prisma/migrations/**/migration.sql`。
5. 上线前必做：`pg_dump` → staging 演练 → 失败恢复演练。

---

## 7. 数据契约要点（交付后端窗口）

- **业务编号不可复用**：`projects.code`、`documents.code`、`regulatory_documents.dispatch_no` 等均为全量唯一；
  删除后只能 **restore（清 `deleted_at`）**，不能新建同编号。
- **软删除表**：User / Project / ProjectTemplate / ProjectPhase / Milestone / Task / TaskTemplate /
  RegulatoryDocument / Report / MonthlyProgress / DocCategory / DocDocument / ReagentMaterial /
  ReagentFormula / Primer / SampleMaterial / FileObject / Attachment。
- **不软删除**：关系表、版本表、审计表、日志表、发号器、字典表（删除即随父级级联或硬删）。
- **`Restrict` 外键命中必须返回 409**，不得返回 500。
- **所有 `DateTime` 以 UTC 存储**（`timestamptz`），展示层负责时区转换。
- **Decimal 字段**（`Prisma.Decimal`）响应层必须 `.toString()`，否则 JSON 序列化异常。
- **Json 字段**写入前必须用 zod 校验；DB 只保证「是合法 JSON」。
- **编号取号**走 `code_sequences` 原子自增，禁止 `count()+1`。

详见窗口交付时的「数据契约」章节。
