# 数据库 Schema 升级事故分析与防范指南

> 本文档源于两次真实生产事故，对问题根因进行完整拆解，并给出可执行的开发规范与工具方案，防止同类事故再次发生。

---

## 一、两次事故复盘

### 事故 1：`Task.taskType` 列缺失

**现象**  
服务器部署成功，但登录后首屏数据加载报 500，控制台提示：
```
Invalid `prisma.task.findMany()` invocation:
The column `main.Task.taskType` does not exist in the current database.
```

**根因链路**  
1. 开发阶段新增了 `src/routes/registrations.js`，向 `Task` 写入 `taskType` 字段
2. 随后编写了 `prisma/migrations/20260518110000_add_regulatory_documents/migration.sql`，内含 `ALTER TABLE "Task" ADD COLUMN "taskType" TEXT`
3. 但服务器上的 SQLite 文件是**早于该迁移创建的历史数据库**，其 `_prisma_migrations` 表没有该条记录
4. 部署脚本运行 `npx prisma migrate deploy` 时日志显示「4 migrations found, No pending migrations to apply」——这是因为服务器 `_prisma_migrations` 表里的记录和迁移文件无法对应，Prisma 直接跳过了
5. 后端启动成功（Prisma Client 已按新 Schema 生成），第一次查询 Task 即崩溃

---

### 事故 2：`ProjectTemplate.preview` 列缺失

**现象**  
部署后"项目模版库"页面一片空白，模版数量为 0，没有报错弹窗。

**根因链路**  
1. `ProjectTemplate` 模型新增了 `preview String?` 字段，但该字段**从未进入任何 migration 文件**（只改了 `schema.prisma`）
2. `npx prisma migrate deploy` 对 `preview` 字段无感知，因为找不到对应迁移文件，什么也不做
3. Prisma Client 按新 Schema 生成，把 `preview` 列写入 `SELECT` 查询
4. 数据库没有该列，`projectTemplate.findMany()` 报 500
5. 前端 `TemplateLibrary.tsx` 的错误处理只打了 `console.error`，没有向用户展示错误，所以页面显示为空列表而不是错误提示

---

## 二、根因总结

这两个事故有共同的触发模式：

```
schema.prisma 改了 ──┐
                     ├──▶ 生产数据库没有对应列 ──▶ 接口 500 ──▶ 前端显示空/崩溃
迁移文件未正确生成 ──┘
```

具体分解为 **3 个环节失效**：

| 环节 | 失效点 | 后果 |
|------|--------|------|
| **开发** | 修改 `schema.prisma` 后没有用 `prisma migrate dev` 生成对应迁移文件 | 数据库与模型不同步 |
| **部署** | `migrate deploy` 依赖迁移文件，文件不存在/记录不匹配时静默跳过 | 列缺失被忽略 |
| **运行时** | 后端启动后没有校验数据库结构是否符合预期 | 接口炸了才发现 |

---

## 三、防范方案（三道防线）

### 防线 1：开发规范——始终用迁移文件驱动 Schema 变更

**规则**：每次修改 `schema.prisma`（新增字段、新增表、修改字段类型），必须立刻生成迁移文件，**不能只改 schema 不生迁移**。

```bash
# 正确流程：改完 schema.prisma 后执行
cd rdpms-system/backend
npx prisma migrate dev --name <描述性名称>

# 例如新增了 ProjectTemplate.preview 字段
npx prisma migrate dev --name add_project_template_preview
```

此命令会：
- 对比当前 schema 和数据库现状，生成 `ALTER TABLE ... ADD COLUMN ...` SQL
- 把这条 SQL 写入 `prisma/migrations/` 目录下
- 同时更新本地开发数据库，让开发环境立即生效

**Git 提交规范**：`schema.prisma` 和对应的 `migrations/` 目录变更**必须在同一个 commit 里**，不允许只提交 schema 不提交迁移文件。

```bash
# 正确的 commit 内容
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ProjectTemplate.preview column"
```

---

### 防线 2：部署检查——在 deploy 脚本里增加迁移状态校验

修改 `deploy.ps1`，在执行 `migrate deploy` 之后**验证迁移是否真的执行了**，并打印 migrate status。

在 `deploy.ps1` 的 Prisma 迁移步骤后添加：

```powershell
# 当前 deploy.ps1 已有的行
npx prisma migrate deploy

# ── 新增：输出迁移状态，有助于排查 deploy 是否真的应用了新迁移 ──
Write-Host "`n=== 检查迁移状态 ==="
npx prisma migrate status
if ($LASTEXITCODE -ne 0) {
    Write-Host "[警告] 迁移状态异常，请检查以上输出！可能存在列缺失风险。" -ForegroundColor Yellow
}
```

`prisma migrate status` 会列出哪些迁移已应用、哪些待应用，一目了然，比"No pending migrations to apply"更详细。

---

### 防线 3：运行时保障——启动时自动校验并修复关键列

这是已经在 `src/index.js` 里实现的**兜底方案**。  
当前代码已有 `ensureTaskRegulatoryColumns()` 和 `ensureProjectTemplateColumns()` 两个函数。

**核心原则**：**每次向任何数据表新增可选列时，必须同步在 `index.js` 的对应函数里追加该列的补丁条目。**

当前已有的补丁函数结构（`src/index.js`）：
```js
async function ensureTaskRegulatoryColumns() {
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("Task")');
  const columnNames = new Set((columns || []).map((col) => col.name));

  const missingColumns = [
    { name: 'taskType',              sql: 'ALTER TABLE "Task" ADD COLUMN "taskType" TEXT' },
    { name: 'applicabilityStatus',   sql: '...' },
    { name: 'regulatoryPriority',    sql: '...' },
    { name: 'expectedDeliverable',   sql: '...' },
    { name: 'regulatoryNotes',       sql: '...' },
  ].filter((item) => !columnNames.has(item.name));

  for (const item of missingColumns) {
    await prisma.$executeRawUnsafe(item.sql);
  }
}
```

**新增字段时的操作清单**（参见第四节）。

---

## 四、每次新增字段时的操作清单

> 每次改 `schema.prisma`，必须按顺序完成以下所有步骤。

### Step 1：用 `prisma migrate dev` 生成迁移

```bash
cd rdpms-system/backend
npx prisma migrate dev --name <功能名称>
```

验证 `prisma/migrations/` 下出现了新目录且 migration.sql 包含对应的 `ALTER TABLE` 或 `CREATE TABLE`。

### Step 2：在 `src/index.js` 对应的 ensure 函数中追加补丁条目

找到或新建对应表的 `ensure<TableName>Columns()` 函数，把新列追加进去：

```js
// 示例：ProjectTemplate 新增了 someNewField 列
{ name: 'someNewField', sql: 'ALTER TABLE "ProjectTemplate" ADD COLUMN "someNewField" TEXT' }
```

> 注意：`NOT NULL` 列必须有 DEFAULT 值，否则旧数据行补列会报错。
> 建议新列尽量设计为 `TEXT?`（可空）或携带 `DEFAULT`。

### Step 3：一起提交

```bash
git add prisma/schema.prisma
git add prisma/migrations/
git add src/index.js
git commit -m "feat: add <TableName>.<fieldName> column"
```

### Step 4：部署后验证

部署成功后，在服务器 PM2 日志里确认启动日志：
- 没有新列需要补丁 → 日志里没有 `✅ Patched` 字样（正常，说明迁移执行到位了）
- 有新列被兜底补上 → 日志出现 `✅ Patched xxx columns: yyy`（可接受，但说明防线 1/2 没有生效，需要排查原因）

---

## 五、前端错误处理补强（配合定位问题）

上面两次事故中，前端的错误处理让问题更难发现——接口 500 了，但页面只是显示"暂无数据"。

建议在关键列表页增加接口错误的明确提示：

```tsx
// TemplateLibrary.tsx 示例
async function fetchList() {
  setLoading(true);
  setError(null);
  try {
    const res = await projectTemplatesAPI.list({ page: 1, pageSize: 200 });
    setList((res as any).list || []);
  } catch (e: any) {
    console.error(e);
    setError(e?.error || e?.message || '加载失败，请刷新重试');
  } finally {
    setLoading(false);
  }
}

// JSX 里
{error && (
  <div className="text-red-500 bg-red-50 rounded p-3 mb-4 text-sm">
    ⚠️ 数据加载失败：{error}
  </div>
)}
```

**意义**：如果接口返回 500，用户会直接看到错误信息而不是困惑地盯着空列表，开发者排查时也能第一眼知道是接口问题。

---

## 六、快速参考：新增字段时的检查卡

```
□ 1. 修改了 schema.prisma
□ 2. 运行了 `npx prisma migrate dev --name xxx`，确认迁移文件生成
□ 3. 在 src/index.js 对应的 ensure 函数中追加了该列的兜底补丁
□ 4. schema.prisma + migrations/ + index.js 在同一个 commit 里提交
□ 5. 部署后查看 PM2 启动日志，确认服务正常起来（没有启动报错）
□ 6. 快速访问受影响的前端页面，确认数据正常显示
```

---

## 七、本项目当前的已知补丁清单

| 表 | 补丁函数 | 补丁列 | 对应迁移 |
|----|----------|--------|----------|
| `Task` | `ensureTaskRegulatoryColumns()` | taskType, applicabilityStatus, regulatoryPriority, expectedDeliverable, regulatoryNotes | `20260518110000_add_regulatory_documents` |
| `ProjectTemplate` | `ensureProjectTemplateColumns()` | type, parentId, isMaster, preview, status | 无专用迁移（直接在原始建表中应有，但历史数据库版本不同） |

> 当补丁函数里某一列的迁移被确认已正常部署到所有环境后，该列的补丁条目**可以删除**，减少启动时的检查开销。
