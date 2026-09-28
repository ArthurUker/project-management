# 第七轮证据包（de260fc 独立复核 A01–A10 整改 + 真实浏览器验收）

本目录是本轮**新产生**的证据。旧 `round6` 运行清单/结果/截图**一字未改**，
其真实版本出处见 `../PROVENANCE-CORRECTION.md`（旧清单的 `HEAD` 是**运行时**指针，
且当时 `worktreeDirty=true`，不得当成某个提交的结果）。

## 1. A01–A10 处理表

| 编号 | 复核结论 | 修复位置（提交） | 测试证据 | 状态 |
|---|---|---|---|---|
| A01 | 历史版本接口缺项目访问授权（非成员 200 拿到他人正文） | `backend/src/routes/reports.js` 版本路由：先解析日报所属项目 → read 能力 → 删除态判定（`f55f3f1`） | 单测 `tests/unit/rf04-versions-access.test.mjs`；**真实隔离库** `tests/integration/rf04-versions-access.integration.test.mjs`：A01-I1 成员 200 且拿到正文 / A01-I2 撤权 404 且响应不含正文 / A01-I3 已删除 404 | 已修复并闭环 |
| A02 | POST upsert 可绕过 update 权限与并发基线 | `backend/src/routes/reports.js`：命中已有草稿必须 `reports.update` + 项目 write + 作者归属；无基线兼容路径与 PUT 同规则；写入改 `updateMany` 原子 CAS（`24952d1`） | 单测 `tests/unit/rf04-post-upsert-authz.test.mjs`；**真实隔离库** `tests/integration/rf02-post-concurrency.integration.test.mjs`（同基线不同 key 仅一方成功） | 已修复并闭环 |
| A03 | 旧同步响应可把 A 的草稿归到 B 名下 | `frontend/src/offline/engine.ts`：同步绑定发起时主体 + 会话代次；缓存键按主体分片；**登出尾段竞态修复**（状态切换先于任何 await）；新会话隔离他人队列（`8da0fc9`/`3575f67`/`0dcf0ae`） | 单测 `tests/unit/offlineAccountSwitch.test.ts` E1–E4；**真实浏览器** `tests/browser/a03.e2e.mjs` 7/7 | 已修复并闭环 |
| A04 | 多项目与保存/提交复用的 key 管理器会重置历史 key | `frontend/src/shared/idempotency.ts` 改为「会话 + 槽位 + **资源作用域**」：只有同一资源的签名变化才轮换，成功子步骤保留 key；`ReportEdit` 调用点迁移（`e46f82b`/`e09b9e5`） | 单测 `tests/unit/idempotency.test.ts` K1–K11；**真实浏览器** `rf03b` B05-h/B06-c/B06-e | 已修复并闭环 |
| A05 | 混合「有关联/无关联项目」记录被静默丢弃 | `frontend/src/pages/ReportEdit.tsx` + 新增 `frontend/src/offline/pendingDraft.ts`：缺项目记录必须出现在失败项、正文保留、按主体分片本地留存（刷新可恢复），补关联后各存一次才清除（`e09b9e5`/`81a9c42`） | 单测 `tests/unit/pendingDraft.test.ts` P1–P4；**真实浏览器** `tests/browser/a05.e2e.mjs` 10/10 | 已修复并闭环 |
| A06 | 退出清理键名错误（`cursor`/`acl` 误删、`conflicts` 从未清理） | `frontend/src/offline/idb.ts` 使用真实键名并按主体分片；登出前把未同步队列按主体转入持久拒绝区（不静默销毁）（`906ac5b`/`0dcf0ae`） | 单测 `tests/unit/deadLetter.idb.test.ts`（A06 用例）、`tests/unit/offlineScope.test.ts` A03-I1/I2；**真实浏览器** `a03.e2e.mjs` B2/B3 | 已修复并闭环 |
| A07 | B04–B06 的 API 辅助函数取不到令牌，并把鉴权失败当空集合 | 新增 `frontend/tests/browser/authHelper.mjs`（统一读 `rdpms.accessToken`、非 2xx 抛错、登录后校验主体、显式 token 调用、Node 侧夹具通道）；`rf03b.e2e.mjs` 全量重写（`e46f82b`/`7002e0e`） | `rf03b` 由 **3/14 → 23/23**；断言按保存响应 ID / 请求侧幂等键 / 审计增量核对 | 已修复并闭环 |
| A08 | 日报编辑页未实现已提交/已审核只读状态 | `frontend/src/pages/ReportEdit.tsx`：加载服务端状态与作者归属，只读时禁用表单，按状态呈现保存/提交/撤回/前往审阅，删除仅限可编辑草稿（`e09b9e5`） | **真实浏览器** `rf03b` B04-d（项目 MANAGER 成员审核通过）、B04-f（保存草稿不可用 + 状态提示）、B04-g（绕界面写入被服务端 409 拒绝） | 已修复并闭环 |
| A09 | 拒绝草稿保存了但 UI 不能取回；重复合并覆盖原 payload | `SyncConflictDialog.tsx`（查看/复制/重试/显式放弃）、`deadLetter.ts`（保留首次 payload，同 key 不同内容显式记录 `payloadConflict`）、`engine.retryRejection`；服务端 `routes/sync.js` 回执**只回放 applied**（`0dcf0ae`） | 单测 `deadLetter.idb.test.ts` A09-I6；**真实浏览器** `tests/browser/f10.e2e.mjs` 9/9；**真实隔离库** `tests/integration/rf02-sync-rejection-retry.integration.test.mjs` | 已修复并闭环 |
| A10 | README 对浏览器证据版本的描述不实 | 旧 `round6` 清单/结果一字未改，出处更正见 `../PROVENANCE-CORRECTION.md`；本轮新运行独立记录在本目录，清单新增 `suite / testCodeHash / configHash / worktreeStatus / finishedAt / postRunHash / fixtures / resultSummary` | 每个 runId 均有 manifest + results JSON；`finishedAt`/`postRunHash` 在结束时回写 | 已更正 |

## 2. 本轮运行清单（每个 runId 一份 manifest + results）

所有运行均在**隔离库 `rdpms_test`** 上执行，后端/前端端口动态分配，运行前硬校验库名与实例标识。
清单字段含义：

- `git.head/headShort/worktreeDirty/worktreeStatus`：运行那一刻的提交与**代码目录**脏状态；
- `sourceHash`：后端 `src` / 前端 `src` 的内容哈希；`buildArtifactHash.dist`：后端构建产物的内容哈希；
- `testCodeHash.browserTests`：**测试脚本本身**的内容哈希（复核要求：只有业务源码哈希不足以证明测试脚本版本）；
- `configHash`：`vite.config.ts` / `tsconfig.app.json` / 前后端 `package.json` 内容哈希；
- `finishedAt` + `postRunHash`：运行结束时间与运行后重新计算的内容哈希（前后不一致即不得作为正式证据）；
- `fixtures` / `resultSummary`：本轮合成账号、项目与各套件 PASS/FAIL 汇总。

**最终基线批次**（代码目录 `worktreeDirty=false`，全部含 `finishedAt` 与 `postRunHash`）：

| 套件 | 覆盖 | 结果 | runId | 提交 | frontendSrc | testCodeHash | dist |
|---|---|---|---|---|---|---|---|
| `rf03.e2e.mjs` | B01–B03 新建/回填/提交 | 8/8 PASS | `2026-09-28T02-54-54-107Z-56b640` | `52326c5` | `dd2703e9…` | `43ca479b…` | `336a95f4…` |
| `rf03b.e2e.mjs` | B04–B06 审核链路 / 多项目部分失败重试 / 提交丢响应重试 | 23/23 PASS | `2026-09-28T02-50-00-746Z-30d5e3` | `e628b93` | `dd2703e9…` | `3b1b0102…` | `336a95f4…` |
| `f10.e2e.mjs` | F10 离线被拒变更持久化与恢复闭环（真实 IndexedDB） | 9/9 PASS | `2026-09-28T02-51-17-730Z-b95d9c` | `e628b93` | `dd2703e9…` | `3b1b0102…` | `336a95f4…` |
| `a03.e2e.mjs` | A03 账号切换本地数据隔离 | 7/7 PASS | `2026-09-28T02-51-42-066Z-6ad7a8` | `e628b93` | `dd2703e9…` | `3b1b0102…` | `336a95f4…` |
| `a05.e2e.mjs` | A05 缺项目记录不得静默丢弃 | 10/10 PASS | `2026-09-28T02-52-01-985Z-3d2041` | `e628b93` | `dd2703e9…` | `3b1b0102…` | `336a95f4…` |

说明：`rf03` 的运行提交为 `52326c5`，比其余四套件（`e628b93`）多一个提交，但该提交**只改了 rf03 自己的清单写入方式**
（测试脚本），业务源码哈希与其余套件完全一致（`frontendSrc=dd2703e9…`、`dist=336a95f4…`），
因此这一组可以视为同一份被测代码。
`testCodeHash` 不同是预期的：`rf03` 在 `52326c5` 上多了一次脚本改动，各套件记录的是**各自当次**的测试脚本内容哈希。

> 本目录同时保留若干**失败/中断运行**的 manifest 与 results（作为缺陷发现过程的取证）。
> 判断某次运行是否可用于结论，以该 runId 的 `resultSummary.fail` 与 `finishedAt` 是否为空为准；
> 失败运行的大体积截图已删除，JSON 证据保留。

## 3. 服务端/单元测试（非浏览器）

| 层次 | 命令 | 结果 |
|---|---|---|
| 后端未定义标识符 | `npm run lint:undefined`（backend） | 52 文件 0 命中 |
| 后端单元 | `npm test`（backend → test:unit） | 76/76 PASS |
| 后端契约 | `npm test`（backend → test:contract） | 6/6 PASS |
| 后端真实集成 | `npm run test:integration`（隔离库，缺库退出码 2） | 38/38 PASS，0 跳过 |
| 前端纯逻辑单测 | `npm test`（frontend） | 42/42 PASS |
| 前端生产构建 | `npm run build`（`tsc -b && vite build`） | 见交付说明（构建通过） |

## 4. 本轮实现过程中新发现并修复的问题

1. **登出异步尾段覆盖新会话主体**（`frontend/src/offline/engine.ts`）——
   「登出 → 立刻登录」时新主体被覆盖为 `null`，同步变成无主同步，服务端拒绝的回包被当作无主变更删除，
   用户未提交内容静默消失。修复：状态切换前移到任何 `await` 之前；清理按登出主体执行且在被接管时放弃；
   新会话隔离他人队列；无主体时不同步。回归：`offlineAccountSwitch.test.ts` A03-E4 + F10 浏览器用例。
2. **同步回执把失败结果也永久回放**（`backend/src/routes/sync.js`）——
   被拒/冲突的 mutation 之后同 key 上行一律回放旧失败，「修好原因后重试」永远不可能成功。
   修复：只回放 `applied`，失败结果重新判定并 upsert 覆盖。回归：`rf02-sync-rejection-retry.integration.test.mjs`（真实库）。
3. **用例日期撞库导致假失败**：`runId` 取模只有 10 种取值，重复运行会撞上已提交日报（编辑页只读）。
   修复：改用「本账号/本项目当月空闲日期」。

## 5. 边界与未运行项（如实声明）

- **未运行**：生产库/演练库的任何写入；push、合并与部署（本轮只做本地提交）。
- **未覆盖**：真实多设备并发、跨时区、性能与容量、移动端布局、浏览器扩展干扰。
- 旧 `round6` 证据保持原样，仅作历史失败证据；不得据此称当前版本通过或失败。
- HTTP 幂等回执（`mutation_receipts`）语义**未改动**（仍是「同键重放首次结果」）；
  本轮只调整了**同步上行**回执（`sync_mutations`）的失败可重试语义。
