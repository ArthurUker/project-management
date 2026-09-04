# M-1 · RBAC 最终权限基线 v1.0（签字版 / FROZEN）

| 项 | 值 |
|---|---|
| 文档编号 | M-1 |
| 版本 | v1.0 |
| 状态 | **已冻结（FROZEN）** |
| 落盘日期 | 2026-09-03 |
| 落盘窗口 | W9 Final Integration / Closing Execution |
| 前置窗口 | W1 DB-Clean · W2 BE-Design · W3 FE-Review · W4 OPS · W5 CTL · W6 ORCH · W7 Contract Review · W8 RBAC Review |
| 勘误 | Errata-01（见 §9） |

> **变更纪律**：M-1 v1.0 已冻结。任何权限码、P0/P1 归属、默认角色权限集合、sortOrder 的修改，
> 必须提交 **M-1 v1.1 变更申请** 并经总控书面批准，执行窗口不得自行升版或改口径。
> 若代码实现与本文件冲突，**改代码，不改本文件**。

---

## 1. 冻结裁定速查

```text
P0 = 90                     首版 permissions 表只写 P0 90 条
P1 = 30                     P1 不进 seed、不入库、不授予任何角色
ADMIN       = 80            90 - 10 排除项
SUPER_ADMIN = 90            全部 P0
MANAGER     = 66
MEMBER      = 31
VIEWER      = 19
AUDITOR     = 3
RolePermission 总数 = 289   (90+80+66+31+19+3)

AuditLog.action = String @db.VarChar(64)     删除 Prisma enum AuditAction
AuditAction 展示走 EnumMeta(enumName='AuditAction')，共 19 项

system.logs.view 保留 P0；ADMIN 不持有 system.logs.view
AUDITOR 恰好持有 audit.view + audit.export + system.logs.view

/api/reagents 是聚合读取/导出路由；reagent_lots 不新增独立权限码
SUPER_ADMIN 项目 override 不进 permissions.code
最终项目权限 = 系统权限 ∩ 项目成员能力
非项目成员访问资源返回 404（隐藏资源存在性）
```

---

## 2. P0 — 90 条权限码（首版 seed 唯一入库清单）

> 校验：总数 **90**，不得多、不得少、不得改名。
> 命名空间：`resource.action`，小写 + 下划线 + 点。

### 2.1 users（7）

```text
users.view
users.create
users.update
users.enable
users.disable
users.reset_password
users.delete
```

### 2.2 roles（6）

```text
roles.view
roles.create
roles.update
roles.delete
roles.assign_permissions
roles.assign_user
```

### 2.3 projects / project_phases / tasks / milestones（17）

```text
projects.view
projects.create
projects.update
projects.archive
projects.manage_members
project_phases.view
project_phases.create
project_phases.update
project_phases.change_status
tasks.view
tasks.create
tasks.update
tasks.change_status
tasks.assign
milestones.view
milestones.create
milestones.update
```

### 2.4 reports / progress（9）

```text
reports.view
reports.create
reports.update
reports.submit
reports.review
reports.export
progress.view
progress.create
progress.update
```

### 2.5 docs（5）

```text
docs.view
docs.create
docs.update
docs.review
docs.categories.manage
```

### 2.6 regulatory_documents / registrations（9）

```text
regulatory_documents.view
regulatory_documents.create
regulatory_documents.update
regulatory_documents.delete
registrations.view
registrations.create
registrations.update
registrations.change_stage
registrations.export
```

### 2.7 project_templates / task_templates（8）

```text
project_templates.view
project_templates.create
project_templates.update
project_templates.delete
task_templates.view
task_templates.create
task_templates.update
task_templates.delete
```

### 2.8 primers / samples / reagent_materials / reagents / formulas / prep_records（19）

```text
primers.view
primers.create
primers.update
primers.export
samples.view
samples.create
samples.update
reagent_materials.view
reagent_materials.create
reagent_materials.update
reagents.view
reagents.create
reagents.update
reagents.export
formulas.view
formulas.create
formulas.update
prep_records.view
prep_records.create
```

### 2.9 files / audit / settings / dashboard / data / system（10）

```text
files.upload
files.download
files.delete
audit.view
audit.export
settings.view
settings.update
dashboard.view
data.export
system.logs.view
```

**计数校验**：7 + 6 + 17 + 9 + 5 + 9 + 8 + 19 + 10 = **90**

---

## 3. P1 — 30 条后置清单（不进首版 seed）

> 校验：总数 **30**。首版 `permissions` 表中**不得出现**以下任何 code，任何角色**不得持有**。

```text
users.import
users.export
projects.restore
projects.delete
project_phases.delete
tasks.delete
milestones.delete
reports.delete
progress.delete
docs.publish
docs.archive
docs.delete
regulatory_documents.import
regulatory_documents.export
registrations.delete
project_templates.copy
primers.import
primers.delete
samples.export
samples.delete
reagent_materials.import
reagent_materials.delete
reagent_materials.export
reagents.delete
formulas.delete
prep_records.update
prep_records.delete
files.view
files.restore
system.logs.export
```

---

## 4. 否决清单（禁止设立）

以下权限码**不可设立**，任何位置（schema / seed / BE / FE / 文档）出现即为缺陷：

```text
roles.export
system.health
dict.read
files.metadata.view
settings.audit.view
system.logs_read
system.logs.read
audit.read
projects.edit
tasks.update_status
users.manage
regulatory.manage
detection_targets.*
```

说明：显式否决项 **12 个** + `detection_targets.*` **1 条通配**。
旧文档曾表述为「13 项 + 1 通配」，属表述勘误，见 **Errata-01**，不影响权限冻结本身。

---

## 5. 8 项高危清单

```text
users.delete
roles.create
roles.update
roles.delete
roles.assign_permissions
roles.assign_user
settings.update
data.export
```

**ADMIN 不持有以上 8 项。**

此外 ADMIN 也不持有：

```text
audit.export
system.logs.view
```

因此 **ADMIN 总排除 10 项**：

```text
users.delete
roles.create
roles.update
roles.delete
roles.assign_permissions
roles.assign_user
settings.update
data.export
audit.export
system.logs.view
```

---

## 6. 六角色默认权限矩阵

### 6.1 数量基线

| 角色 | 权限数 |
|---|---:|
| SUPER_ADMIN | 90 |
| ADMIN | 80 |
| MANAGER | 66 |
| MEMBER | 31 |
| VIEWER | 19 |
| AUDITOR | 3 |
| **RolePermission 总数** | **289** |

### 6.2 SUPER_ADMIN = 90

持有全部 P0 90 条。

### 6.3 ADMIN = 80

= P0 90 条 − 10 条排除项（见 §5）。

持有：`audit.view`、`settings.view`。
不持有：`audit.export`、`system.logs.view`、`data.export`、`settings.update`、`users.delete`、`roles.*`。

### 6.4 MANAGER = 66

```text
users.view

projects.view
projects.create
projects.update
projects.archive
projects.manage_members

project_phases.view
project_phases.create
project_phases.update
project_phases.change_status

tasks.view
tasks.create
tasks.update
tasks.change_status
tasks.assign

milestones.view
milestones.create
milestones.update

reports.view
reports.create
reports.update
reports.submit
reports.review
reports.export

progress.view
progress.create
progress.update

docs.view
docs.create
docs.update
docs.review
docs.categories.manage

regulatory_documents.view
regulatory_documents.create
regulatory_documents.update
regulatory_documents.delete

registrations.view
registrations.create
registrations.update
registrations.change_stage
registrations.export

project_templates.view
task_templates.view

primers.view
primers.create
primers.update
primers.export

samples.view
samples.create
samples.update

reagent_materials.view
reagent_materials.create
reagent_materials.update

reagents.view
reagents.create
reagents.update
reagents.export

formulas.view
formulas.create
formulas.update

prep_records.view
prep_records.create

files.upload
files.download
files.delete

dashboard.view
```

MANAGER 不持有：

```text
task_templates.create  task_templates.update  task_templates.delete
project_templates.create  project_templates.update  project_templates.delete
audit.view  audit.export  system.logs.view
settings.view  settings.update
roles.*
data.export
users.create  users.update  users.enable  users.disable  users.reset_password  users.delete
```

### 6.5 MEMBER = 31

```text
projects.view
project_phases.view
tasks.view
milestones.view
reports.view
progress.view
docs.view
regulatory_documents.view
registrations.view
project_templates.view
task_templates.view
primers.view
samples.view
reagent_materials.view
reagents.view
formulas.view
prep_records.view
dashboard.view

tasks.create
tasks.update
tasks.change_status

reports.create
reports.update
reports.submit

progress.create
progress.update

docs.create
docs.update

prep_records.create

files.upload
files.download
```

MEMBER 不持有：`users.*`、`roles.*`、`audit.*`、`settings.*`、`system.logs.view`、`data.export`、
`tasks.assign`、`reports.review`、`docs.review`、`docs.categories.manage`、
任何 `*.export`、`projects.create/update/archive/manage_members`、
`milestones.create/update`、`samples.create/update`、`reagent_materials.create/update`、
`reagents.create/update`、`primers.create/update`、`formulas.create/update`、`files.delete`。

### 6.6 VIEWER = 19

```text
projects.view              project_phases.view        tasks.view
milestones.view            reports.view               progress.view
docs.view                  regulatory_documents.view  registrations.view
project_templates.view     task_templates.view        primers.view
samples.view               reagent_materials.view     reagents.view
formulas.view              prep_records.view
dashboard.view
files.download
```

VIEWER 不持有：`users.view`、`roles.view`、任何 `create/update/delete/review/change_status/assign/export`、
`files.upload`、`files.delete`、`audit.*`、`settings.*`、`system.logs.view`、`data.export`。

### 6.7 AUDITOR = 3

AUDITOR **恰好**持有：

```text
audit.view
audit.export
system.logs.view
```

AUDITOR 不持有：`dashboard.view`、`settings.view`、`settings.update`、`users.view`、`roles.view`、
`files.download`、任何业务 `*.view`、任何业务写权限、`data.export`。

AUDITOR 下钻业务实体**只能**走：

```text
GET /api/audit/entity/:type/:id/summary
权限：audit.view
```

**不得**通过授予业务 `*.view` 实现合规只读。

---

## 7. AuditAction 命名空间

### 7.1 DB 字段

```prisma
action String @db.VarChar(64) @map("action")
```

- **必须删除** `enum AuditAction`；禁止保留或重建 Prisma enum `AuditAction`。
- `AuditLog` 新增 `metadata Json? @db.JsonB @map("metadata")` 与 `audit_logs_metadata_gin_idx`（GIN）。
- 命名空间区分：`AuditLog.action` 用 **动词/事件优先**；`Permission.code` 用 **resource.action**。两者**不得混用**。

### 7.2 19 项固定清单

```text
create
update
delete
restore
login
login.failed
logout
token.refresh
password.change
permission.change
submit
approve
reject
assign
status.change
upload
download
export
read.sensitive
```

### 7.3 旧审计 action 禁止（迁移映射）

以下 FE/BE 旧审计 action **不得**用于新写入：

| 旧值 | 新写法 |
|---|---|
| `auth.login` | `login` |
| `auth.login_failed` | `login.failed` |
| `project.create` | `create` + `entityType=PROJECT` |
| `user.disable` | `status.change` + `entityType=USER` |
| `file.upload` | `upload` |
| `backup.export` | `export` |

---

## 8. `/api/reagents` 聚合路由与 SUPER_ADMIN override

### 8.1 `/api/reagents` 聚合路由

- `/api/reagents` **不对应** `Reagent` model；schema 中**不得恢复** `model Reagent`，BE 中**不得**出现 `prisma.reagent.*` 或 `include: { reagent: true }`。
- 底层表：`reagent_materials` / `reagent_lots` / `reagent_formulas`。

| 路由 | 方法 | 权限 / 行为 |
|---|---|---|
| `GET /api/reagents` | GET | `reagents.view` |
| `GET /api/reagents/:id` | GET | `reagents.view` |
| `GET /api/reagents/export` | GET/POST | `reagents.export`（P0 唯一试剂导出出口） |
| `POST /api/reagents` | — | **405** |
| `PATCH /api/reagents/:id` | — | **405** |
| `PUT /api/reagents/:id` | — | **405** |
| `DELETE /api/reagents/:id` | — | **405** |
| `GET /api/reagent-lots` | GET | `reagents.view` |
| `POST /api/reagent-lots` | POST | `reagents.create` |
| `PATCH /api/reagent-lots/:id` | PATCH | `reagents.update` |

- **不新增** `reagent_lots.*` 权限码；**不新增** `reagent_materials.export`（P1）。
- 响应字段涉及原料/配方详情时：若无 `reagent_materials.view` 或 `formulas.view`，
  相关字段返回 **null**，**key 不省略**（保持响应结构稳定）。

### 8.2 SUPER_ADMIN override

- SUPER_ADMIN 的项目级 override 属 **BE 行为**，**不进** `permissions.code`，**不得**出现 `.override` / `.elevate` 权限码。
- SUPER_ADMIN 可列全量项目，**不写** elevated 审计。
- SUPER_ADMIN 访问**非成员单项目详情或项目内资源**时，写 `AuditLog.metadata.elevated=true`。

建议 metadata 结构：

```json
{
  "elevated": true,
  "bypass": "project_membership",
  "permissionCode": "projects.view",
  "reason": "..."
}
```

### 8.3 项目权限 ∩ 模型

```text
最终权限 = 系统权限 ∩ 项目成员能力
非项目成员                -> 404（隐藏资源存在性）
成员但项目角色能力不足    -> 403
ProjectMember.leftAt IS NULL 才算有效成员
非 SUPER_ADMIN 的 GET /api/projects 必须按成员过滤
```

项目成员能力：

| 项目角色 | 能力集 |
|---|---|
| OWNER | read, write, delete, transition, assign, manage_members |
| MANAGER | read, write, transition, assign |
| MEMBER | read, write |
| VIEWER | read |

---

## 9. Errata-01（勘误）

| # | 位置 | 旧表述 | 裁定 | 影响 |
|---|---|---|---|---|
| E-01 | §4 否决清单 | 旧文档写作「13 项 + 1 通配」 | 显式否决项为 **12 个**，另有 `detection_targets.*` **1 条通配** | **表述勘误**，不新增/不移除任何否决项，**不影响权限冻结** |
| E-02 | W4 preflight §权限 SQL 契约注释 | `ADMIN = 81（90 - 8 高危 - audit.export）` | ADMIN 总排除 **10 项**（8 高危 + `audit.export` + `system.logs.view`），**ADMIN = 80** | 口径勘误；preflight `ADMIN_EXPECTED` 已由 81 修正为 80 |
| E-03 | W4 preflight §5.1 门禁 | `! grep -q "AuditAction" schema.prisma` | 应只禁 schema 中的 **`^enum AuditAction`**；EnumMeta / 文档中的普通字符串 `AuditAction` **允许存在** | 门禁口径勘误，preflight 已改为 `grep -qE '^enum AuditAction\b'` |
| E-04 | W8 遗留 | `system.logs.view` 一度被提议移出 P0 | **保留 P0**；改由「ADMIN 不持有」实现收窄 | 已冻结，不再讨论 |

---

## 10. DB 验收 SQL（真源）

> 只在**人工显式触发**（`RUN_SQL_CONTRACT=1`）时执行；本仓库任何自动化不得连接数据库。

```sql
-- 10.1 权限总数
SELECT count(*) FROM permissions;                                  -- 90

-- 10.2 各角色权限数
SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code='SUPER_ADMIN';  -- 90
SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code='ADMIN';        -- 80
SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code='MANAGER';      -- 66
SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code='MEMBER';       -- 31
SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code='VIEWER';       -- 19
SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code='AUDITOR';      -- 3

-- 10.3 RolePermission 总数
SELECT count(*) FROM role_permissions;                            -- 289

-- 10.4 ADMIN 禁 10 项（期望 0 行）
SELECT p.code
FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
JOIN permissions p ON p.id=rp.permission_id
WHERE r.code='ADMIN'
AND p.code IN (
  'users.delete','roles.create','roles.update','roles.delete',
  'roles.assign_permissions','roles.assign_user','settings.update',
  'data.export','audit.export','system.logs.view'
);

-- 10.5 AUDITOR 恰好 3 条
SELECT p.code
FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
JOIN permissions p ON p.id=rp.permission_id
WHERE r.code='AUDITOR'
ORDER BY p.code;
-- 期望：audit.export / audit.view / system.logs.view

-- 10.6 P1 不入库（期望 0 行）
SELECT code FROM permissions
WHERE code IN (
  'projects.delete','tasks.delete','reagent_materials.export',
  'files.view','files.restore','system.logs.export'
);

-- 10.7 否决清单不存在（期望 0 行）
SELECT code FROM permissions
WHERE code IN (
  'roles.export','system.health','dict.read','files.metadata.view',
  'settings.audit.view','system.logs_read','system.logs.read','audit.read',
  'projects.edit','tasks.update_status','users.manage','regulatory.manage'
)
OR code LIKE 'detection_targets.%';

-- 10.8 AuditLog.action 类型
SELECT data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name='audit_logs' AND column_name='action';
-- 期望：character varying / 64

-- 10.9 AuditLog.metadata 列存在
SELECT column_name
FROM information_schema.columns
WHERE table_name='audit_logs' AND column_name='metadata';
-- 期望：1 行

-- 10.10 metadata GIN 索引
SELECT indexname
FROM pg_indexes
WHERE tablename='audit_logs' AND indexname='audit_logs_metadata_gin_idx';
-- 期望：1 行

-- 10.11 无废弃 enum
SELECT count(*) FROM pg_type WHERE typname IN ('PermissionCode','AuditAction');
-- 期望：0
```

---

## 11. 签字

| 窗口 | 职责 | 状态 |
|---|---|---|
| W1 DB-Clean | schema / seed / baseline | 已裁定 |
| W2 BE-Design | 权限内核 / P0 端点 / mass-assignment | 已裁定 |
| W3 FE-Review | 权限码 / 菜单 / 页面 | 已裁定 |
| W4 OPS | preflight / smoke / perm-matrix | 已裁定 |
| W5 CTL | 总控裁定 | 已冻结 |
| W6 ORCH | 窗口编排 | 完成 |
| W7 Contract Review | 契约复核 | 通过 |
| W8 RBAC Review | 权限复核 | 通过 |
| **W9 Final Integration** | **收尾落盘 / 静态验收** | **执行中** |

**本文件为唯一权限真源。代码实现与本文件冲突时，一律以本文件为准并修改代码。**
