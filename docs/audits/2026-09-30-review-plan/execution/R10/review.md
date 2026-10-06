# R10 · 文件访问、隔离与关联

状态：COMPLETE。日期：2026-09-30。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`，与冻结基线一致。本包定向检查统一文件列表/元数据/下载/删除、法规原文读取别名、项目访问上下文、文件策略/绑定命令和 FileObject/Attachment 模型。继承历史 B11/B12 隔离路由证据；本轮未运行动态验证、未使用附件或恶意文件，也未修改业务代码/测试。

## 文件读取出口矩阵

| 出口 | 入口与系统权限 | 归属授权/扫描/软删/审计 | 本轮观察 |
|---|---|---|---|
| 文件列表 | `GET /api/files`，`files.download` | `deletedAt:null` + `listVisibilityFilter`；按公共、显式共享读权限、可见项目、本人暂存过滤；超级管理员列表按策略扩展；返回扫描状态 | 有统一列表 scope，列表本身不输出文件字节。`needsClassification=true` 仅超管。 |
| 元数据 | `GET /api/files/:id/metadata`，`files.download` | `loadFileOrThrow` 调 `decideFileAccess(METADATA)`；项目 scope 先解析 project access；过滤软删。该路由没有单独审计调用。 | 受 FileAccessPolicy 控制；策略不检查 scanStatus。 |
| 常规下载 | `GET /api/files/:id`、`GET /api/files/:id/download`，均 `files.download` | `loadFileOrThrow` 判 scope/owner/project；软删 404；随后显式拒绝 `scanStatus=INFECTED`；读取 safeStoragePath；下载前写审计。FAILED 仍可下载但 riskHint=true；SKIPPED 为默认状态，不代表扫描安全。 | 两个路径共用同一下载函数和扫描阻断。 |
| 法规原文别名 | `GET /api/regulatory-documents/:id/original-file`，认证后手动检查 `regulatory_documents.view` | 新 FileObject 路径检查 `decideFileAccess(IMPORT_SOURCE)`、文件软删；未检查 scanStatus，也未调用统一下载服务/审计。若 FileObject 读失败则回退 legacy 文件。 | 当前兼容出口与常规下载对感染文件的保护不一致（B11）。 |
| 法规列表/详情原文元数据 | `GET /api/regulatory-documents`、`/:id`，`regulatory_documents.view` | `loadOriginalFiles` 对附属 FileObject 调 METADATA policy；无权限时按“无原文”返回；该返回的 file select 未包含 scanStatus。 | 不返回字节；访问策略与项目 scope 不完全一致，见 B12。 |
| 备份导出 | `GET /api/backup/export`，归属 R12/R13 | 输出数据库备份 JSON，不是 FileObject 读取 | 本包不重复审阅备份与发布流程。 |
| 其他后端路由文件读取搜索 | `backend/src/routes` 中 `safeStoragePath/readFile/createReadStream` | 定向检索找到 files.js 与 regulatory-documents.js 的对象/旧目录文件内容出口；backup route 输出序列化 JSON | 未发现其他直接读 FileObject 字节的业务路由；不等于全仓所有动态生成导出均审完。 |

前端 `downloadFile()` 实际请求 `/files/:id` 并使用 Authorization blob 下载。法规页面读取 `originalFileId` 后调用这个通用入口；旧 `/regulatory-documents/:id/original-file` 是兼容路由，当前检索未发现前端调用，但外部客户端仍可直接访问后端路由。前端引用：[frontend/src/api/files.ts] 和 [frontend/src/pages/RegulatoryDocumentsPage.tsx]（行号见 coverage）。

## B11 · P1 · SUPPORTED · 法规原文兼容入口绕过感染文件阻断

**入口/前提：** 已认证且拥有 `regulatory_documents.view` 的用户请求 `/api/regulatory-documents/:id/original-file`；法规条目存在且原文附件关联到 FileObject。

**当前调用链（S）：** `regulatoryDocuments.use('*', authMiddleware)` → handler 内 `hasPerm(regulatory_documents.view)` → 查法规条目/原文 Attachment → 对活 FileObject 调 `decideFileAccess(FILE_ACTION.IMPORT_SOURCE, ...)` → `safeStoragePath` 读取字节并返回（`regulatory-documents.js:15,522-552`）。FileAccessPolicy 的 `FileRecord` 不含 scanStatus，决策分支不会基于它做扫描检查（`fileAccessPolicy.ts:45-61,116-192`）。对比通用下载函数：调用相同资源策略后显式检查 `row.scanStatus === 'INFECTED'` 并返回 403（`files.js:182-198`）。

**历史动态证据（H，仅继承）：** `backend-results.json#B11_ORIGINAL_FILE_BYPASSES_INFECTED_BLOCK` 使用无害文本构造 `scanStatus=INFECTED`；通用下载 403，而法规原文别名返回200及字节。历史证据不涉及真实恶意样本。本轮没有重跑。

**反证/保护：** 原文别名具认证与法规查看系统权限；新流程还检查 FileAccessPolicy、关联附件与 file deletedAt。它仍没有统一扫描状态判定和下载审计。当前标准前端下载走 `/files/:id`，但兼容后端入口仍可被直接请求，不消除服务端路径差异。

**已证明影响：** 已标记为 INFECTED 的 FileObject 通过通用下载被拒绝，但同一对象可经法规原文别名返回字节。未使用真实恶意内容，不据此断言病毒实际执行或扫描引擎部署状态。

**条件风险未升级：** 若新 FileObject 读取抛错，handler 会继续尝试 legacy `${documentId}__*` 文件（`553-561`）。此回退是否可能返回已删除/隔离的同一历史副本，取决于磁盘上是否残存匹配文件；本轮未检查该目录或构造场景，不作为单独影响结论。

建议统一 FileReadService：同一调用负责资源授权、deletedAt、扫描策略、物理读取和审计；兼容入口也必须调用。验收对 INFECTED 文件逐一请求 `/files/:id`、`/download`、法规原文别名均拒绝并可审计；FAILED/SKIPPED 的产品策略显式定义，不把它们标成安全通过。

## B12 · P2 · SUPPORTED · 文件项目策略拒绝合法的超管 elevated 访问

**入口/前提：** SUPER_ADMIN 持 `files.download` 请求 ownerProjectId 指向其不是成员的项目文件元数据或下载。

**当前调用链（S）：** `files.js:53-60` 调 `resolveProjectAccess()`；对 SUPER_ADMIN，resolver 返回 `isMember=false`、全部能力、`elevated=true`（`projectAccess.js:36-43`）。调用方只把 `{isMember, capabilities}` 传给策略，丢掉 elevated 标记（`files.js:52-60`）。`decideFileAccess()` 的 PROJECT 分支第一步强制要求 `projectAccess.isMember`，因此即使 capabilities 包含 write 也返回隐藏 404（`fileAccessPolicy.ts:147-159`）。对比普通项目详情，SUPER_ADMIN 非成员访问允许继续并触发 `auditElevatedIfNeeded()`（`projects.js` 对照由 R04 已审，不在本包重扫）。

**历史动态证据（H，仅继承）：** `backend-results.json#B12_SUPER_ADMIN_PROJECT_FILE_DENIED` 记录同一非成员超管的普通项目详情 200、项目文件元数据 404。此为隔离路由证据，本轮未重跑。

**反证/保护：** 策略有意保护非成员，项目文件不因全局 files.download 自动公开；一般非成员仍应 404。问题局限于与 `resolveProjectAccess` 声明的 SUPER_ADMIN elevated 例外不一致。文件读取路径当前没有透传 elevated 或发起敏感读取审计。

**已证明影响：** 按当前项目访问规则可访问非成员项目的 SUPER_ADMIN 无法经文件策略读取该项目文件元数据；历史探针证明该访问拒绝。对恢复操作影响是潜在运维影响，没有单独量化。

建议 FileAccessPolicy 接收统一项目 access 决策对象而非 `isMember` 布尔值；对 SUPER_ADMIN elevated 读取保留显式标记并写 `READ_SENSITIVE` 审计。验收：普通非成员仍 404；项目成员按 scope 读取；超管非成员仅在对应系统权限下可读且必有 elevated 审计。

## 绑定、删除与存储窗口

`resolveBindTarget()` 仅对登记的 PROJECT/PHASE/TASK/MILESTONE/REPORT/MONTHLY_PROGRESS 推导项目归属；法规文档推导为 `SHARED_LIBRARY + regulatory_documents.view`；未知类型保留私有暂存（`fileCommands.ts:22-94,180-214`）。文件默认 PRIVATE_STAGING；绑定命令显式写 accessScope/owner/project/shared permission/classification 时间（`fileCommands.ts:100-123`；schema `FileObject:1416-1457`）。

法规附件替换路径 `linkOriginalFile()` 顺序执行清旧附件、建新 Attachment、解析目标、更新 FileObject 作用域（`regulatory-documents.js:174-194`），不是一个事务。中间失败可能出现附件与 FileObject scope 未同步的状态；本轮没有故障注入，因此记录为静态提交窗口/修复设计考量，不列新确认发现。删除文件先检查活动 Attachment；法规原文等证据引用导致 409，否则将 FileObject 软删并写审计（`files.js:285-310`；`fileCommands.ts:125-161`）。数据库的 Attachment FK 为 `onDelete: Restrict`，FileObject 和 Attachment 各自有 deletedAt（schema `1468-1485`）。DB 与磁盘对象的物理删除/清理任务不在本包执行，亦未定位到本次可证明的跨介质丢失。

## 结论与未覆盖边界

B11 `SUPPORTED/P1`；B12 `SUPPORTED/P2`；新确认发现 0。未访问上传目录、用户附件、真实 `.env`；未运行测试/浏览器/恶意样本；未检查对象存储清理 worker 或所有非路由导出生成器；未把 legacy fallback 的条件风险升级为发现。R10 COMPLETE 表示本包源码/证据审阅完成，不表示修复或安全验收。
