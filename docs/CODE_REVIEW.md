# 全局代码审阅报告 · RDPMS 系统

> 审查日期：2026-07-09
> 审查范围：后端（Hono + Prisma + SQLite）、前端（React18 + TS + Vite + Zustand）、数据模型与离线同步
> 说明：本报告中**未修改任何源码**，仅记录问题供后续决策。所有路径均为绝对路径。

共发现约 **60+ 项**问题，按领域与严重度归类如下。

---

## 🔴 严重 · 安全与数据完整性（建议优先处理）

### 后端认证 / 授权

1. `backend/src/routes/auth.js:9` — JWT 密钥硬编码默认 `'rdpms-jwt-secret'`，未设 `JWT_SECRET` 时攻击者可伪造任意身份/角色 token。
2. `backend/src/index.js:263-266` — CORS `origin:'*'` + `credentials:true` 同时开启，任意源可跨域携带凭证。
3. `backend/src/routes/primers.js`（整模块）— 引物/探针库**完全无认证**，任何匿名请求可读写删敏感研发数据。
4. `backend/src/routes/docs.js`（整模块）— 知识库**完全无认证**，文档 CRUD/版本/搜索均匿名可访问。
5. `backend/src/routes/projectRoles.js`（整模块）— 角色接口无认证，且文件**根本未在 `index.js` 注册**（死代码），自带独立 `PrismaClient` 重复实例。
6. `backend/src/routes/projects.js:415` `tasks.js:233` `docs.js:249` — 项目/任务/文档的 `DELETE` **无任何权限校验**，任意登录用户可删除他人数据。
7. `backend/src/routes/sync.js:130-221` — `/sync/push` 越权：report 更新不校验归属（`userId`），task 更新不校验所属项目，普通用户可改写他人汇报/任务；且新建时**信任客户端传入的 `id`**，可覆盖他人记录。
8. `backend/src/routes/backup.js:115-238` — `restore` 未用事务：关外键后逐表 `deleteMany`/`createMany`，中途失败留下"半恢复"残损库，且篡改备份可注入 admin 提权。

### 前后端契约 / 离线同步数据丢失

9. `frontend/src/api/client.ts:216-230` + `backend/src/routes/reagents.js` — `reagentsAPI` 调用的 `/reagents/categories`、`/reagents/recipes` 后端**根本不存在**，全部 404（整段兼容层悬空）。
10. `backend/src/routes/sync.js:86-111` + `frontend/src/store/appStore.ts:156-160` — 后端 sync 返回 `milestones`/`monthlyProgress`，前端只 `bulkPut` 了 `projects/reports/tasks`，**里程碑与月度进展被直接丢弃**，离线态永不可见。
11. `backend/src/routes/sync.js:130-221` — `/sync/push` 只接受 `reports`/`tasks`，本地新增的 `milestones`/`monthlyProgress`/`projectMembers` **无法上行**，离线变更联网后永久丢失。
12. `backend/src/routes/sync.js:51-58` — `projectMembers` 每次全量拉取无增量，且前端无对应表，成员关系落不了地；成员退出项目后本地残留脏数据。
13. `backend/src/routes/sync.js:140-167` — report push 更新只写 `content`/`status`，**丢弃 `approvedBy`/`approvedAt`/`approveNote`**，审批状态上行时被回退。
14. `frontend/src/api/client.ts:173-179` — `projectTemplatesAPI.roles.*` 请求 `/project-templates/:id/roles`，后端 roles 路由挂在 `/api/templates/:templateId/roles` 且**未挂载**，角色管理功能全部 404。
15. `frontend/src/utils/AdaptiveUploadQueue.ts:427` — 默认请求 `/api/records/*`，后端无此路由；且该队列类**全项目无调用方**（死代码 + 未接入同步）。
16. `frontend/src/api/client.ts:3` — `API_BASE` 默认 `/api`，但生产若设 `VITE_API_URL` 指向根域，所有请求缺 `/api` 前缀导致整站失效（缺 `.env` 约定，部署风险高）。

---

## 🟠 中 · 逻辑 Bug / 校验缺失 / 类型与运行时风险

### 后端

17. `projects.js:230-287` `tasks.js:182-208` — `PUT` 把整段 `body` 直接写库；`startDate`/`dueDate` 为空串时 `new Date('')` 产生 `Invalid Date`/`epoch` 未归一，且未校验修改者权限（`managerId` 可越权改）。
18. `reports.js:84-130` — 创建汇报未校验 `projectId` 是否存在、未校验 `userId` 是否为项目成员。
19. `reports.js:133-155` — 允许改 `month`/`reportType`，可能破坏唯一约束一致性。
20. `projects.js:581-609` `tasks.js:269` — 批量删/改项目、批量改任务状态仅登录即可，无 admin/manager 校验。
21. `backup.js:62-73` — `parseDates` 日期字段列表未覆盖 `plannedSubmissionDate`/`dueDate`/`expiryDate` 等，恢复时这些字段不被解析。
22. `auth.js:195` — 改密码未处理 `user` 为 null 的健壮性边界。
23. `docs.js:200` — `updatedBy` 解析后从未写入 `updatedAt`/记录，字段被静默丢弃。

### 前端

24. `store/appStore.ts:196` — `init()` 中 `online/offline` 监听器**无 cleanup**，StrictMode 下重复注册（内存泄漏）。
25. `store/appStore.ts:122` — `isOnline: navigator.onLine` 模块加载时求值，首次离线态可能误判。
26. `constants/statusColors.ts` vs `Projects.tsx:11` vs `ProjectCard.tsx:33` — 状态机三套各自为政；`STATUS_TRANSITIONS` 缺 `'草稿'` 而起止态有 `'草稿'`，草稿项目迁移下拉无合法目标（前后端状态机不一致）。
27. `utils/permissions.ts:39` — 角色→权限在前端硬编码，可据角色推断按钮显隐，属 UI 级权限绕过（后端须为唯一权威）。
28. `api/client.ts:14-27` — `ApiResponse` 带 `[key:string]:any` 索引 + `<T=any>`，全项目弱类型取值，契约变更无编译期告警。
29. `pages/RegistrationProjectDetail.tsx:20` — `useState<any>(null)` 若请求失败未守卫判空，渲染 `project.xxx` 会崩溃。
30. `pages/reagent-formula/index.tsx:70` `hooks/useRegulatoryDocuments.ts:30` — `useEffect` 依赖不完整，切分类/快速切换时可能展示脏数据或卸载后 setState。
31. `components/ProcessFlowDiagram.tsx:1289` `FormulaBatchEditor.tsx:60` — `setTimeout`/`mousedown` 监听器无 cleanup（内存泄漏/卸载后调用）。
32. `CreateProjectModal.tsx:520` `EditProjectModal.tsx:462` `store/appStore.ts:178` — token/用户信息明文存 `localStorage` 且无 try-catch，XSS 可读取（敏感信息泄露面）。
33. `pages/Login.tsx:23` — 仅读 `err.error`，后端返回 `{message}` 时错误文案丢失。

---

## 🟡 低 · 死代码 / 重复 / 小瑕疵

34. **未挂载/死页面**：`pages/ProjectTemplates.tsx`（无路由无引用）、`components/FlowEditor.tsx`（被新流程图替代的遗留）、`pages/RegulatoryDocumentsPage.tsx`（仅经 Docs 间接挂载，独立路由未挂）。
35. **死代码 API**：`reagentsAPI` 整段无调用；`AdaptiveUploadQueue` 整类无调用；`Reagent` 旧模型与 `ReagentMaterial` 功能重叠（`schema.prisma:377`）；`reagent`/`reagents` 双套命名并存。
36. `utils/versionLock.js`（整文件）— 乐观锁模块**从未被任何路由调用**，且 `schema` 缺 `version Int` 字段（假防护）。
37. `store/appStore.ts:13,23` — Dexie `syncMeta` 表定义后从未读写（增量书签机制缺失）。
38. `projects.js:129` — 生产环境 `console.log` 完整请求体（含潜在敏感字段）。
39. `middleware/idempotency.js:60` — 幂等缓存用进程内 `Map`，多实例/重启失效（已知限制）。
40. `index.js:34,63,99` 等多处 `$executeRawUnsafe` 拼接（列名来自固定常量，当前无注入面，但属不安全习惯）。
41. `schema.prisma` — `Milestone` 缺 `projectId` 索引、`MonthlyProgress` 无 `updatedAt` 索引，sync 增量无法利用索引。
42. `sync.js:7` — sync 路由仅 `authMiddleware`，无 `adminOrManagerMiddleware`，叠加 task 越权。
43. 类型/配置漂移：`ProjectCard`/`Projects`/`Tasks` 各自重复定义 `Project`/`STATUS_CONFIG` 接口与状态色；`sync` 返回 `serverTime`(毫秒) 与 `syncTime`(ISO) 格式混用。

---

## 修复优先级建议

- **P0（安全/数据破坏）**：#1–#8、#10（认证、JWT、CORS、DELETE 权限、sync 越权、backup 事务）
- **P1（功能失效/数据丢失）**：#9、#11–#16（契约断裂、sync 丢弃里程碑/成员、死路由）
- **P2（健壮性/UX）**：#17–#33
- **P3（清理）**：#34–#43（死代码、重复、索引、小瑕疵）
