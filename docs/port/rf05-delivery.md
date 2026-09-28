# RF05 文件作用域 —— 交付说明（对应发现 F11）

提交：`830d3cf`（主体）+ 本文件同批提交（恢复端点与文档）。
验收（06 §第一阶段）：甲项目成员看不到乙文件列表/metadata/下载；上传者私有暂存隔离；import-source 也检查；历史无归属不自动公开。

## 1. 变更文件

| 文件 | 说明 |
|---|---|
| `backend/src/modules/files/fileAccessPolicy.ts` | **新增**：纯规则层（4 类作用域 × 6 类动作 × 项目能力/权限），`effectiveScope` 负责「归属不明→私有」降级 |
| `backend/src/modules/files/fileCommands.ts` | **新增**：绑定目标解析（实体→项目/共享库）、暂存→可见的作用域迁移、删除守卫、历史归类规则 |
| `backend/prisma/schema.prisma` | `FileObject` 增加 `accessScope/ownerUserId/ownerProjectId/sharedReadPermission/classifiedAt/classifiedById` + enum `FileAccessScope` + 2 个索引 |
| `backend/prisma/migrations/20260928120000_file_access_scope/migration.sql` | expand + 可逆回填（项目内实体→PROJECT、法规原文→SHARED_LIBRARY、头像→PUBLIC、其余保持未分类） |
| `backend/src/routes/files.js` | 全部入口接入策略；新增 `GET /:id`（前端实际下载路径）、`PATCH /:id/scope`（超管分类）、`POST /:id/restore`（软删恢复） |
| `backend/src/routes/regulatory-documents.js` | 原文的元数据回填、绑定（`linkOriginalFile`）与下载（import-source）接入同一策略 |
| `backend/src/kernel/storage.js` | `putObject` 写入即 `PRIVATE_STAGING` + owner；元数据落库失败清理孤儿文件 |
| `backend/scripts/backfill-file-scope.mjs` | 历史归属分类脚本（默认只读盘点，`--apply` 幂等落库；与迁移/命令共用同一规则实现） |
| `backend/tests/unit/rf05-file-access-policy.test.mjs` | 11 条纯规则用例 |
| `backend/tests/integration/rf05-file-scope.integration.test.mjs` | 8 条真实隔离库用例 |
| `frontend/tests/browser/rf05.e2e.mjs` | 11 条真实浏览器（真实登录会话）用例 |

## 2. 新旧契约映射

| 入口 | 旧行为（F11） | 新行为 |
|---|---|---|
| `POST /api/files` | 建 FileObject 即"存在"，任何持 `files.download` 者可见 | 一律 **PRIVATE_STAGING**（仅上传人）；`resourceType/resourceId` 只作意图记录，不隐式绑定 |
| `GET /api/files` | 全量列表（仅校验全局权限） | 按作用域过滤：本人暂存 / 可见项目 / 已声明共享库 / 公共；超管可 `?needsClassification=true` 列未分类 |
| `GET /api/files/:id` | **未实现（404）**，但前端 `downloadFile`/`getFileBlobUrl` 一直调用它 | 与 `/download` 同权下载（策略一致） |
| `GET /api/files/:id/metadata` `…/download` | 仅全局权限 | 策略判定：非成员/非上传者 → **404**（隐藏存在性），能力不足 → 403 |
| `DELETE /api/files/:id` | 仅全局权限，直接软删 | 策略 + **证据引用守卫**：被 `REGULATORY_DOCUMENT`（或 `label=evidence`）引用 → 409 `FILE_REFERENCED_BY_EVIDENCE` |
| `PATCH /api/files/:id/scope` | 不存在 | **新增**：超管人工分类（PROJECT 需项目存在；SHARED_LIBRARY 需合法权限码），留审计 |
| `POST /api/files/:id/restore` | 前端一直在调用，后端**未实现** | **新增**：仅超管 + 审计；软删只写 `deletedAt`，字节与行都保留 |
| `regulatory-documents` 原文（列表回填 / `original-file` / 绑定） | 只校验 `regulatory_documents.view`；附件关系即"有原文" | 元数据与读取走同一策略（import-source）；绑定成功后 `SHARED_LIBRARY + sharedReadPermission=regulatory_documents.view` |

数据库迁移：新增列/枚举/索引（expand，无破坏性变更）。回退方法写在迁移文件尾部（DROP COLUMN/TYPE），且脚本 `backfill-file-scope.mjs` 可重复执行。

## 3. 测试证据（实际输出）

- 单元：`node --test tests/unit/rf05-file-access-policy.test.mjs` → **11/11 PASS**
  （U1–U9 策略：暂存/项目/共享库/公共/未分类/删除/列表过滤；U10 归类优先级；U11 删除守卫）
- 集成（真实库 `rdpms_test`）：`npm run test:integration` → **46/46 PASS，0 跳过**，其中 RF05：
  - I1 项目文件 list/metadata/download：非成员 404、成员 200
  - I2 私有暂存隔离：同项目成员也不可见，上传者可读可删
  - I3 历史无归属不自动公开：普通用户 404、超管可读、`needsClassification` 清单仅超管可见
  - I4 绑定到任务后按项目授权（staging → visible，写 `classifiedAt`）
  - I5 import-source：未绑定 → 404、无 `regulatory_documents.view` → 403、绑定共享库 → 200
  - I6 删除被证据引用 → 409 且文件仍在
  - I7 超管人工分类 → 生效；非超管 PATCH → 403
  - I8 软删可恢复（非超管 403 / 超管 200，恢复后作用域不变）
- 浏览器（真实登录会话 + 真实角色权限）：`node tests/browser/rf05.e2e.mjs` → **11/11 PASS**
  （上传→暂存；本人 metadata/download/list 200；另一账号 404 且列表不含；法规列表与页面渲染回归）
- 后端全量回归：单元 87/87、契约 6/6、`lint:undefined` 52 文件 0 命中。

## 4. 未运行项 / 未覆盖

- **未在生产库/演练库执行任何写入**；迁移与回填只在隔离库 `rdpms_test` 跑过（生产上线前需先跑 `backfill-file-scope.mjs` 的 dry-run 盘点）。
- 对象存储：当前只有 `LOCAL` provider 落地；S3/OSS/COS 未接入（与 RF05 无关，属既有边界）。
- 跨项目显式共享命令（05 §6「文件绑定其他项目必须经过显式共享命令」）**尚未实现**：当前不支持跨项目共享，需要时再走独立任务。
- 前端尚无通用文件管理界面（文件能力目前只被法规原文使用），因此没有"文件库"页面的端到端用例。

## 5. 数据风险与处置

- 迁移把历史文件默认为私有暂存并做可推导回填：**不会自动公开**任何历史文件；反向风险是"历史上靠全局权限可见的文件在迁移后对部分用户不可见"。
- 处置：① 回填已按附件关系尽量推导；② 推导不出的进入 `needsClassification` 清单，由超管用 `PATCH /:id/scope` 人工分类；③ 误删可用 `POST /:id/restore` 恢复；④ 上线前在生产库跑 dry-run 盘点并交业务确认。

## 6. 是否 ADR 偏离

无技术栈变更，未引入新依赖；新增列为 expand 迁移（可回退），新增两个端点为接口补全（`restore` 是前端既有调用、`scope` 是人工分类所需），未改变既有响应形状。与 05 §6 的「不能只根据任意一条附件关系自动授予权限」一致。
