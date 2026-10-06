# R12 — 备份快照与恢复结果可信度

## 状态与范围

- 包状态：`COMPLETE_WITH_PENDING`。
- 基线：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`；本轮 HEAD 与基线一致。
- 范围：`backupRestore.js`、`routes/backup.js`、`schema.prisma`、`backup-pg.sh`、`backup-drill.py`；继承旧审计 B13、D01 及其历史隔离证据。未运行任何备份、恢复或 drill 脚本，未连接数据库、未改业务代码或业务数据。
- 结论：B13 与 D01 在当前源码上仍成立。另记录一个候选风险 R12-N01（PENDING）：脚本没有显示数据库 dump 与 uploads 快照共同恢复点；缺少实际并发写入和运维调度证据，暂不作为已确认缺陷计数。本机 D01 复现仅支持 macOS 文件语义；目标 Linux 和生产环境未验证。

## 入口与数据流

```text
GET /api/backup/export
  -> MODULE_FETCHERS (逐模块并行 findMany)
  -> JSON { version, exportedAt, modules, data }

POST /api/backup/restore/preview
  -> assertSuperAdmin -> validatePayload (读取目标 DB 做差异/FK/唯一键检查)

POST /api/backup/restore
  -> assertSuperAdmin / replace 确认门
  -> applyRestore -> 再次 validatePayload
  -> 单个 Prisma 事务：replace 逆序 deleteMany；按父先子后写入
  -> createMany(skipDuplicates) / merge update -> 汇总及审计

deploy/scripts/backup-pg.sh KIND
  -> pg_dump -Fc -> pg_restore -l -> dump SHA-256
  -> cp -al latest SNAP -> rsync --delete uploads -> latest 链接
  -> 清理旧 dump / 上传目录 -> 可选 COS 同步
```

应用层 export/restore 是所列模块的 JSON 数据回灌，不是整库与文件二进制备份：例如 schema 有 `ProjectPhase`、`FileObject`、`Attachment`，但 export fetcher 和 `RESTORE_TABLES` 没有这些表。运维脚本才另用 `pg_dump` 做整库备份并单独复制 uploads。两条路径不可混称为同一完整备份机制。

## 发现裁定

### B13 — P1 — `SUPPORTED`，当前源码仍支持

- **入口/调用链：** SUPER_ADMIN 调用 `/api/backup/restore/preview` 或 `/restore` → `validatePayload` → `applyRestore`。路由确实对 restore 做超管限制和 replace 显式确认；apply 在一个事务中执行。
- **触发前提：** payload 内出现不同主键但冲突的唯一字段值（历史例为两个 User 使用同一 username）。当前目标 DB 中不存在对应主键，以致行进入 `newRows`。对于并发修改目标库，也存在 preview 与 apply 校验间状态变化的窗口，但本轮没有复现该竞争。
- **源码证据：** `RESTORE_TABLES` 的唯一键元数据只列出部分单列键；唯一冲突检查从 `unique` 取值且只取前 `CHUNK=500` 个去查目标库，未检测 payload 内同一唯一值对应不同主键，也未覆盖 schema 中全部唯一/复合唯一约束。写入对 `newRows` 使用 `createMany({skipDuplicates:true})`，随后 `summary.created` 与逐表 `created` 都按输入数组长度累计，而没有读取 Prisma 返回的 `count`。见 `backupRestore.js:19-53, 203-230, 313-349`。Schema 示例：username/email/avatarFileId 单列唯一 `schema.prisma:399-429`；ProjectMember、TemplateRole、TemplatePhase、TemplateTask、ProjectPhase、PhaseTransition、TaskDependency、Report、ReportVersion、MonthlyProgress 等复合唯一约束分别见 `634-648, 681-714, 717-735, 741-786, 878-891, 1040-1085, 1088-1110`。
- **历史动态证据（H）：** `backend-results.json#B13_RESTORE_SILENT_DUPLICATE_DROP` 记录隔离 DB 结果：`previewOk=true`、接口 `reportedCreated=2`、数据库 `actualCreated=1`。旧报告归纳了 duplicate username 场景。该证据是历史隔离环境结果，不证明生产库现况；当前审阅未重跑。
- **已有保护/反证：** 主键字段存在及 payload 内主键重复会被检查；已声明的部分唯一键会检查与目标库冲突；未解析非空 FK 可能被拒绝或警告；写入事务失败整体回滚；恢复仅限 SUPER_ADMIN，replace 需确认并对非空审计/同步设备有提前拒绝。这些机制不能发现 payload 内唯一键冲突，也不能使 skipDuplicates 计数准确。
- **已证明影响：** 历史探针证明两行输入被接受预检，恢复成功响应计数为 2，而数据库只插入 1 行。静态检查证明当前源码保留同一路径。
- **建议与验收：** 由 schema 或统一约束清单生成完整主键、唯一键、复合唯一键与 FK 合同；校验 payload 内唯一键重复及目标库全量冲突，不截断检查集；对任何意外冲突整批回滚，移除不透明 skipDuplicates 或按 DB 真实 `count` 回报。隔离验收覆盖每类约束、500/501 边界、并发目标变动、每表 planned/inserted/updated/deleted/unchanged 行数及关联核对；响应数须与事务后数据库查询相等。

### D01 — P1 — `SUPPORTED`，目标平台待验证

- **入口/调用链：** 定时/人工执行 `deploy/scripts/backup-pg.sh` → 若 `$UP_DIR/latest` 是目录则 `cp -al latest SNAP` → 对 `$SNAP/` 执行带 `--delete` 的 rsync → 将 `latest` 更新为 `$SNAP`。见 `backup-pg.sh:68-77`。
- **触发前提：** 已有 `latest` 且它是脚本前一轮创建的指向 dated snapshot 的软链；后续 cp/rsync 对该路径按软链行为处理。
- **历史证据（H）：** `backup-result.json#D01_BACKUP_SNAPSHOT_ALIASES_HISTORY` 记录隔离 macOS 27 arm64 实验：第二快照是软链，首轮快照旧文件消失、新文件出现。实验脚本 `verify-backup.py` 使用临时目录和 disposable 文件。该结果不等于目标 Linux 行为，也不是生产备份证据。
- **当前源码证据（S）：** `backup-pg.sh:70-76` 保留原 `cp -al latest SNAP` 和随后 `rsync -a --delete` 逻辑；无临时快照目录、无确认 SNAP 是真实目录的门、无发布前校验。脚本的静态控制流与历史触发序列一致。
- **已有保护/反证：** dump 有 `pg_restore -l` 可读性检查和 SHA-256；文件副本未见逐文件 manifest/摘要验证；脚本没有在 Linux 上运行的证据。`find -type d` 清理 dated snapshots，而未见 latest/文件快照与 DB dump 配对保留合同。不能据此声称生产文件备份已损坏。
- **已证明影响：** macOS 隔离实验中的首轮快照内容被第二轮覆盖；当前脚本仍有相同命令序列。目标 Linux 与生产是否出现同一结果尚未证明。
- **建议与验收：** 新建确定为真实目录的 staging 快照，以解析后的上一快照作为 rsync `--link-dest`，复制完成后生成并验证文件清单/摘要，再原子发布不可变 dated snapshot 与 latest。先保全现有 dump、uploads 和日志，再修复脚本；不得用可疑快照覆盖业务库。平台验收至少两轮新增、修改、删除后核对首轮摘要保持不变、二轮清单正确、软链仅指向完整发布目录；Linux 结果需在目标发行版隔离路径获取。

### R12-N01 — `PENDING` 候选风险（暂不确认严重度）

- **当前能确认：** backup 脚本先调用 `pg_dump`，完成列表检查与摘要后才开始 rsync 文件；该脚本没有实现数据库与文件采集间的共同 run/checkpoint（`backup-pg.sh:52-77`）。schema 显示文件元数据在 DB、二进制在外部 storage（`schema.prisma:1416-1457`）。这证明脚本内未实现协调机制，但不能单凭代码证明任务运行时允许并发业务写入，也不能排除调度/平台在脚本外暂停写入。
- **影响路径（待证）：** 只有备份窗口内有改变 DB 元数据/附件引用与 uploads 内容的写入，且没有外部协调时，dump 与文件副本才可能反映不同状态。此运行前提与恢复后影响本轮均未验证；不作为已观察影响。
- **当前边界：** 历史 D01 复现的是快照别名污染，与该候选风险无关。需先查明实际调度/写入屏障，再通过隔离配对演练确定是否可触发。
- **建议与验收：** 定义有应用级写入屏障/版本化对象清单的共同 checkpoint：记录 DB dump 哈希、文件快照 ID/manifest 哈希、同一 run ID 与采集时间；测试期间安排文件元数据与二进制的新增/修改/删除，并证明还原配对后引用、文件大小和 SHA-256 一致。若无法冻结写入，则使用可证明一致的 DB snapshot 与文件存储快照/版本机制并记录边界。

## 恢复覆盖矩阵与逐表计数合同

### 当前预检边界

1. 主键：所有 `RESTORE_TABLES` 都声明单列 `id`，唯 `rolePermissions` 声明 `(roleId, permissionId)`；payload 内只检测这些主键字段是否缺失/重复。见 `backupRestore.js:19-58, 176-201`。
2. 唯一键：注册表为有限白名单；校验器未检测 payload 自身唯一键冲突，既有库查询仅检查已声明字段并对值列表做 `slice(0, 500)`。复合唯一键没有表达结构。Schema 的 FK/唯一约束最终可阻止一部分非法写入，但 `skipDuplicates` 会忽略可由 DB 唯一约束跳过的行。
3. FK：注册表显式声明的 `refs` 仅涵盖一部分字段；例如 User 自引用、updatedBy/createdBy、角色/文档/文件/系统关系等没有完整统一映射。未命中应用预检的硬 FK 可在写入时被数据库发现并令事务回滚；这不是完整、可读的 preview 合同。可空的未知引用作为 warning 不会阻止写入，必须与数据库实际 FK 的可空性一致。
4. replace：只清空 payload 所包含且非 append-only 的表；`auditLogs` 不在 RESTORE_TABLES 内且 append-only；同样未纳入的表会被 DB FK 约束保护。`replace` 不是整库替换，partial payload 更不是全库镜像。
5. 表级汇总：preview 的 `rows/existing/new` 为预校验快照；apply 当前提供汇总输入计数而非实际受影响计数。两者间存在写入差异窗口，也没有每表 restore 后查询对账。只读预览与事务写入不是同一个事务快照。

### 建议的逐表计数合同

对 payload 的每一个受支持表都输出 `sourceRows`、`sourcePrimaryKeysDistinct`、`plannedCreate`、`plannedUpdate`、`plannedNoop`、`rejectedDuplicatePrimaryKey`、`rejectedUniqueConflict`、`rejectedForeignKey`、`dbInserted`、`dbUpdated`、`dbDeleted`、`dbSkipped`、`postRestoreRowsForPayloadKeys`。必须满足：payload 行数 = distinct PK 行数 + 重复 PK 拒绝数；planned create/update/noop 的主键集合互斥且并集等于输入 PK 集；dbInserted 与真实 `createMany.count` 一致；每条更新有受影响行数；任何非显式跳过都失败并回滚；事务后查询按恢复模式解释实际数。对全部 FK 生成 `resolvedInPayload / resolvedInTarget / unresolved` 计数。文件另报 `manifestObjects / restoredObjects / missing / unexpected / sizeMismatch / checksumMismatch`。审计摘要与 HTTP 响应必须引用同一已提交计数对象。

## DB + uploads 同点隔离恢复演练设计（未执行）

禁止将此方案解释为已通过演练。须在有归属证明的临时主机/目录/空隔离数据库实施，不读生产 `.env`，不使用生产对象桶或实际业务正文。

1. **保全与标识：** 暂停自动清理；复制保全当前 DB dump、SHA 文件、全部 uploads snapshot、latest 链接文本、脚本与日志到只读 evidence 目录，记录 SHA-256、stat、软链解析结果和源机/OS/工具版本。将可疑快照标成不可用于覆盖恢复的 quarantine。
2. **建立成对快照：** 用 disposable 用户/项目/附件夹具准备基线 A；生成 DB dump A 与 uploads A，记录一个 `runId`、共同写入屏障时间、DB hash、文件 manifest（相对路径、长度、SHA-256、FileObject/Attachment IDs）。确保应用写入在采集时被阻断，或使用实现可证明的一致快照机制。
3. **第二轮变化：** 释放写屏障后仅在隔离环境做新增、修改、删除各一项，并更新附件关联；再用现有脚本副本/拟修复逻辑做 B。核对 A 的 DB dump/hash、uploads manifest 和实际内容都未变化；B 的 manifest 准确反映三类变化。现有 `backup-pg.sh` 不应直接在任何非空路径试跑。
4. **成对隔离恢复：** 新建空隔离 PostgreSQL 库和空 uploads 根，将同一 runId 的 DB dump 与文件 snapshot 恢复进去；使用 `pg_restore` 到隔离库而非业务库，先核对完整 schema/migrations 与行数，再按约束依赖导入/运行应用层只读对账。逐表比较 dump 的表行数及主键/唯一键合同；匹配 FileObject storageKey 到具体文件，并比较路径、bytes、SHA-256、附件/业务实体引用。
5. **负向对照/验收：** 故意配错 A 数据库与 B 文件集，应由恢复验收报告差异并拒绝签收；移除或篡改一个隔离副本文件，应被 checksum 检出；计数或 FK 不同，不允许出现“恢复成功”。确认隔离资源及临时凭据归属后清理，并保留命令、stdout/stderr、退出码、manifest、逐表对账与清理记录。
6. **停止条件：** 无法证明空库/临时文件根所有权、发现路径指向既有数据库或上传目录、dump/checksum 不匹配、清理边界不清、目标 Linux 语义未取得隔离证据，任一项即停止实际恢复并记录 `PLANNED_NOT_RUN`。

## 待决与未覆盖

- **PENDING：** 在目标 Linux 发行版隔离临时目录对 `cp -al` / symlink / `rsync --delete` 语义做最小复核；本轮不执行该实验。
- **PENDING：** 查明备份窗口是否在脚本外冻结业务写入/使用存储快照，并做隔离配对恢复演练；R12-N01 在此之前为候选风险，不算确认缺陷。
- **PENDING：** 在目标 Linux/生产环境验证备份服务运行身份、实际 `$UP_DIR/$UPLOAD_SRC`、pg_dump/rsync 版本、挂载/ACL、COS 策略、cron 与保留配置。未读取生产配置或数据。
- **PENDING：** 运行与应用并发上传相邻的 DB+uploads 双轮隔离演练，确认 R12-N01 的条件性影响并验证一致点方案；本轮只读设计。
- 不覆盖线上备份存量完整性、异地副本可读性、实际恢复耗时/RTO/RPO、全库所有 schema 约束与 migration 实装差异；未执行 drill 脚本和所有实际恢复操作。

## 来源

- [backupRestore.js](../../../../../rdpms-system/backend/src/kernel/backupRestore.js#L19)
- [routes/backup.js](../../../../../rdpms-system/backend/src/routes/backup.js#L32)
- [schema.prisma](../../../../../rdpms-system/backend/prisma/schema.prisma#L399)
- [backup-pg.sh](../../../../../rdpms-system/deploy/scripts/backup-pg.sh#L52)
- [backup-drill.py](../../../../../rdpms-system/deploy/scripts/drill/backup-drill.py#L1)（仅读取，未运行）
- 历史 B13：`docs/audits/2026-09-29-rdpms/backend-results.json#B13_RESTORE_SILENT_DUPLICATE_DROP`。
- 历史 D01：`docs/audits/2026-09-29-rdpms/backup-result.json#D01_BACKUP_SNAPSHOT_ALIASES_HISTORY`；实验脚本 `verify-backup.py`。
