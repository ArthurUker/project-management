# RDPMS 「试剂/芯片 全流程模板（母版）」只读导出说明

导出时间：2026-10-13 11:02:09 +08:00（Asia/Shanghai）
导出性质：**只读**。未修改业务源码、模板、任务、阶段、角色、数据库或部署配置；未执行 seed / migration / generate / build / test / 安装依赖 / git 写操作；未停止或重启任何服务。

---

## 1. 实际匹配到的模板

按 `code = TPL-REAGENT-MASTER` 精确匹配，命中 **1 条**，与截图描述相符：

| 字段 | 值 |
|---|---|
| id | `e93df987-dfb6-4184-88e9-a6e7ffce5aaf` |
| code | `TPL-REAGENT-MASTER` |
| name | **试剂/芯片 全流程模板（母版）** |
| category / typeLabel | `reagent_chip` / 试剂/芯片开发（label 取自 `TemplateLibrary.tsx` 映射，非库字段） |
| status / isMaster | `ACTIVE` / `true` |
| parentId | 空（无父模板，故 `parentSummary` 为 `null`） |
| updatedAt | 2026-10-13 10:23:14.094 +08 |

**无需记录 TARGET_UNCONFIRMED**：目标存在且名称一致，继续导出。

---

## 2. 统计结果与定义

### 2.1 结构化表统计（可复现定义）
- **阶段数 = 13**：`template_phases` 中 `template_id = 上述模板 id` 的行数。
- **任务数 = 65**：`template_tasks` 中 `template_phase_id ∈ 上述 13 个阶段` 的行数。
- 模板角色数 = 4（`template_roles` 同模板）。

### 2.2 config 统计（对 `template.config` 原始 JSON 字符串解析后计数）
- 顶层阶段数 = **13**
- 顶层任务数（`Σ len(phases[].tasks)`）= **65**
- 子阶段数（`Σ len(phases[].subPhases)`）= **0**
- 子阶段下任务数 = **0**
- `enabled === false` 计数 = 阶段 **0** / 任务 **0** / 子阶段 **0**

> 说明：结构化表中不存在 `enabled` 字段，上述 `enabled` 计数仅来自 config 内字段。

### 2.3 与截图「13 个阶段、65 项任务」的差异

**无差异**。两条口径（结构化表 / config）均为 13 阶段、65 任务，与截图一致。

计数定义已如上明确；本说明**不推测编辑器界面内部统计口径**（是否计入子阶段、禁用项等），仅给出上述两个可复现定义。

---

## 3. 限制与未读取内容

1. **config 原始类型**：数据库中该列为 `jsonb`，但实际值是 **JSON 字符串**（`jsonb_typeof = string`）。导出时 `config` 字段保留**原始字符串**；解析结果放在独立的 `configParsed` 字段，并记录 `configParseOk = true`。未改写、未丢弃任何未知字段。
2. **未读取**：creator/user 关联、`createdById` / `updatedById`、真实账号表、项目实例、样本、实验结果、其他业务数据、`.env` / 连接串 / 口令 / token / SSH 私钥。数据库部分未打印任何凭据。
3. **父模板**：本模板无父，`parentSummary = null`；未递归导出其他模板或项目。
4. **失败项**：无。数据库查询在显式只读事务内成功完成。
5. **源码基线**：7 个相关文件全部存在并记录 SHA256；工作树干净，与 `HEAD` 一致（见 `source-context.json`）。该资料仅用于核对分析基线，不代表部署状态或产品验收结论。
6. **只读事务方式**：本机 `postgres` peer 认证 + `psql`，显式 `BEGIN TRANSACTION READ ONLY … COMMIT`，模板/阶段/任务/角色/父模板均在同一事务内读取，保证快照一致。

---

## 4. 交付文件

| 文件 | 说明 |
|---|---|
| `/home/ubuntu/rdpms-template-export-20261013-110209/template-export.json` | 主交付：`exportMetadata` / `template`（含原始 config）/ `structuredPhases`（阶段+任务）/ `templateRoles` / `parentSummary` |
| `/home/ubuntu/rdpms-template-export-20261013-110209/source-context.json` | 源码基线：仓库路径、HEAD SHA、分支、`git status --short`、7 个文件的存在性与 SHA256 |
| `/home/ubuntu/rdpms-template-export-20261013-110209/EXPORT_NOTE.md` | 本说明 |
| `/home/ubuntu/rdpms-template-export-20261013-110209/raw-db.json` | 附：数据库原始快照（保真中间产物，供核对；内容已完整包含于 template-export.json） |

本次导出结束，未转入修复、模板调整或部署等任何后续工作。
