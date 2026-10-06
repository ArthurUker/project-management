# S02：离线生命周期与浏览器证据补充审阅

- **状态：COMPLETE_WITH_PENDING**
- **审计基线 / 当前 HEAD：** `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`
- **方法：** 定向复核 R02/R07/R08 的报告与覆盖项；只读检查认证恢复、SyncProvider、离线引擎、IndexedDB 封装、Tasks 缓存消费者、token refresh 调用链及历史 v1 代码。未启动浏览器、未运行实验、未读真实浏览器数据、未改业务代码。
- **新增裁定：** F01、F03、F02、F04、N-R02-01 均保留原 ID 和既有裁定；增加源码确认的 `N-S02-01`，专指旧版无主体 outbox 在匿名引导中被误归属，且保全竞态时可能进入新登录主体的 push 请求。未把浏览器实际发生、服务端接受结果或 UI 数据展示升级为已观察证据。

## 生命周期和持久副本时间线

1. `AuthProvider` 初始为 `bootstrapping` 且 `user=null`（`AuthProvider.tsx:17-20`），之后才异步读取 `/me`（`AuthProvider.tsx:31-57`）。`SyncProvider` 的 effect 只看 `user?.id`，匿名/null 分支直接调用 `resetOnLogout()`（`SyncProvider.tsx:30-35`）。因此引导态和显式退出仍进入相同清理路径。
2. `resetOnLogout()` 在第一次 `await` 前捕获当前主体、递增会话代次并清空内存主体（`engine.ts:515-532`）；随后保留它认为属于当前主体的队列行，再调用 `idb.clearAll()` 清空 records/outbox（`engine.ts:534-540`; `idb.ts:176-188`）。匿名引导的 `uidAtLogout=null` 不会把带 A 标记的行选入 `preservePendingForUser(null)`（`engine.ts:473-492`）。新会话代次能阻止已经过期的清理继续执行，但真实 React effect、IDB 打开及 `/me` 完成之间的顺序没有浏览器实测。历史 F01 引擎夹具已观察该特定清理路径导致 outbox 从 1 到 0，未观察真实页面启动。
3. 正常 `start(A)` 设置主体、恢复拒绝项、把显式标记为其他主体的 outbox 移入原主体 dead-letter，然后开始同步（`engine.ts:433-459`）。对未标 `userId` 的历史行，`isolateForeignOutbox()` 的谓词不匹配，故不会转存或阻止这些行。首次 null 引导清理也会将这些行视为待保留行，但以 `anonymous` 为 dead-letter 归属（`engine.ts:473-492`）；若清理顺利完成，B 不会再 push 这些行，但 A 也不能按 A 的主体过滤恢复它们。
4. `syncNow()` 确认有当前主体后读取全量 `outboxAll()`，将每一行映射为 changes 并 push；映射中既不携带 `userId`，也不因缺失 `userId` 而过滤（`engine.ts:241-279`）。默认 transport 是 `syncAPI`（`engine.ts:49-60`），`syncAPI.push` 调用 `/sync/push`（`api/endpoints/sync.ts:71-76`），经 `request.ts` 的 `http` 实例发送（`api/request.ts:1-3,16-39`）；请求拦截器从当前 tokenStore 读取 access token（`http.ts:30-37`）。因此若账号 B 已登录，尚留存的旧行会以 B 当前 access token 发出。源码能证明客户端身份和请求体路径；服务端是否允许该具体变更、是否应用或拒绝，取决于资源和 B 的权限，本包没有据此推断跨主体数据库访问或成功写入。

## `N-S02-01`：旧版无归属 outbox 被误归属，竞态时可能进入当前账号 push

- **入口与触发前提：** 浏览器曾运行 v1 或尚未添加 `userId` 的 v2 客户端，并在 `rdpms-offline` 的 `outbox` 留有 pending 行；这些行是在账号 A 使用期间产生；之后客户端升级，A 未先同步/清除该行；同一 origin 启动阶段的匿名保全尚未完成时，账号 B 已恢复并启动同步。
- **升级证据：** 历史 v1 `idb.ts` 的 `OutboxRecord` 仅有 mutation/entity/op/id/data/baseUpdatedAt/createdAt，且 v1 schema 建有 kv/records/outbox 三个 store，没有主体字段（可复核 `git show f78e87f:rdpms-system/frontend/src/offline/idb.ts` 中 `OutboxRecord` 与 `onupgradeneeded`）。当前 v2 `idb.ts:9-10,42-53` 把版本设为 2；v1→v2 的 `onupgradeneeded` 仅在缺少时创建基础 store 和 `deadLetters` store/index，没有游标回填、outbox 读取/重写或迁移归属逻辑。另一个路径是已有 v2 客户端：`userId` 后来成为可选字段，但数据库版本仍为 2（`git show e09b9e5:rdpms-system/frontend/src/offline/idb.ts`），因此这些已存在的 v2 数据库在代码更新时不会触发版本升级回调。两类旧客户端留下的行都可能没有 `userId`。
- **隔离与保护检查：** 正常 `start(B)` 的 `isolateForeignOutbox(B)` 只筛选 `r.userId && r.userId !== B`；缺 owner 的旧行不满足条件（`engine.ts:548-564`）。匿名 `resetOnLogout(null)` 会选择所有缺 owner 行并逐条以 `userId=anonymous` 迁入 dead-letter（`engine.ts:473-492`）；若这一步先完整结束，则 `clearAll` 清 outbox，避免 B 上行但把旧内容从 A 的 dead-letter 视图中隔离。竞态路径中，reset 在整个逐条保全完成后才检查 sessionGen（`engine.ts:534-540`），单条 move 之间会 await；`start(B)` 可并行恢复拒绝项、隔离 foreign outbox 后开始 sync（`engine.ts:433-459`）。若 B 的 `syncNow` 在无主行仍留在 outbox 时读取队列，`syncNow()` 会 map 全量 changes（`engine.ts:241-279`），请求身份由默认 `syncAPI` 经 `http` 注入 tokenStore 当前 access token（`engine.ts:49-60`; `api/endpoints/sync.ts:71-76`; `api/request.ts:1-3,16-39`; `http.ts:30-37`）。静态代码没有生命周期互斥或 owner 认领门槛。
- **已证明影响：** 静态代码确认完整匿名保全会将旧无主行记为 `anonymous`，A 无法按 A 恢复；也确认若 B 同步在保全尚未移动的行仍留在 outbox 时运行，该行会进入 B 当前授权的 push 请求。未证明浏览器真实调度会命中后一竞态、服务端接受或写入该 mutation，亦未推断跨主体数据库访问。若服务端因 B 无权而拒绝，拒绝留存归属与页面表现本包未验证。
- **裁定：** `SUPPORTED / P2 / SOURCE_ONLY`。静态代码直接确认旧行无归属、匿名误归属分支、保全竞态下进入当前 B 请求的分支及缺少认领门槛。静态裁定本身不需要动态实验（`supplementalVerification=NOT_NEEDED`）；真实浏览器 A→B 时序仍为 `PLANNED_NOT_RUN`，用于确认部署升级链中的触发样本和竞态，不代表修复/产品验收。
- **建议与验收方向：** 升级时不得猜测旧行属于当前登录者。对无主体旧行采用保守隔离并要求用户显式认领/导出/放弃，或按明确迁移规则映射；任何未归属队列存在时，禁止自动随当前登录主体上行。验收需证明升级保留旧 payload 但不会由 B 自动提交；经明确认领后只能由用户确认的主体发出；重新登录 A 时恢复/处理策略符合确定规则。

## 历史发现与本轮边界

- **F01 — SUPPORTED / P1，保持原裁定。** 保留初始 `user=null` 与显式退出共用清理路径、sessionGen 的过期清理保护、以及历史 fake-indexeddb 证据没有覆盖真实 React 启动调度的边界。本轮没有运行真实启动顺序测试。只在临时浏览器配置、合成 A 用户、受控慢/断网 `/me`、预置带主体 outbox 时，才适合补证“真实页面首屏清理是否早于身份恢复”。
- **F03 — SUPPORTED / P2，保持缓存 API 级别结论。** `records` key 仍为 `entity:id` 且无 userId（`idb.ts:24-30,42-47,88-112`）；`readCachedRecords(entity)` 全库读取后只按实体筛选（`engine.ts:140-144`）。本轮重核 Tasks 是已定位消费者：API 失败时读 tasks cache 并直接 `setTasks`（`Tasks.tsx:427-443`）。不据此扩大为报告 UI 泄露；Reports UI 没有找到该缓存 API 消费者。任务字段的业务敏感性及 A/B 页面实际展示仍需隔离页面证据。
- **F02 — SUPPORTED / P1，保持原裁定。** outbox 冲突项删除与 conflict snapshot 写入仍是分开的持久操作；R08 的历史注入证据维持引擎层，不等价于浏览器 IndexedDB 故障表现。本轮未制造 quota/事务失败。
- **F04 — SUPPORTED / P2，保持原裁定。** R08 已证客户端全量 push 与服务端 500 项限制、历史 501 队列不前进。本轮不重跑；实际代理/body byte 限额未知。
- **N-R02-01 — SUPPORTED / P2，保持原裁定。** 多 tab 共用 localStorage token（`tokenStore.ts:10-49`），refresh single-flight 仅为单模块实例（`http.ts:78-107`）；失败路径无条件 `tokenStore.clear()` 并广播过期（`http.ts:128-151`）。真实双 tab 响应次序仍未运行。

## IndexedDB 升级的静态结论

v1→v2 的显式 schema 操作是新增 `deadLetters` object store 和 `userId` 非唯一索引；旧 kv/records/outbox store 若已存在则不重建，也没有显式搬迁记录。普通行字段新增不要求 IndexedDB key schema 改变，但“旧 outbox 行缺 owner”会导致无法执行账号切换隔离，这一点形成 `N-S02-01`。仅凭当前 `onupgradeneeded` 代码，不能断言真实浏览器中升级事务中断会删除旧数据或所有实现上的崩溃行为；这项保留为未执行环境验证。

## 事件时间线与持久副本表

| 场景 | 事件/持久副本顺序 | 已有保护 | 静态结论与缺口 |
|---|---|---|---|
| 首次页面引导，F01 | user=null → SyncProvider reset → 遍历 outbox 按 uid 选择 → clearAll 清 outbox → AuthProvider `/me` 成功后 start(A) | reset 代次在 await 前递增；新会话先启动时旧清理尾段会停止 | 历史引擎夹具证明特定丢失路径；真实 effect/网络/IDB 次序未跑 |
| A→B 客户端升级，N-S02-01 | 旧 A 行无 userId → null 引导逐条迁到 anonymous dead-letter；若 B start 与保全重叠，未移动行可能被 isolate 跳过并进入 syncNow 全量 push，Authorization 用 B 当前 token | 已标 A 的行会 dead-letter 到 A；null 保全先完成时旧无主行不会由 B push | 确认旧行无法按 A 恢复；并发时确认客户端请求身份错配路径，服务端是否应用、真实时序未验证 |
| A→B 共享缓存，F03 | A pull 写全局 records → shared ACL 记录仍保留 → B API 失败 → Tasks 读取全局 tasks 并进入页面状态 | logout 全清；ACL 会清除当前不可见项目 | 缓存 API 无主体过滤；没有 A/B 浏览器 UI 展示证据 |
| conflict 持久化故障，F02 | 服务端返回 conflict → 单独删除 outbox → 仅内存聚合 → 轮末 kvSet conflict | rejected 使用跨 store 原子 deadLetterMove；代次阻止旧会话写入 | 冲突写入失败可丢唯一 payload，历史引擎注入已复现；真实 IDB 故障点未跑 |
| 超限批次，F04 | 全量 outbox 读取 → 单次 push → >500 服务端拒绝 → 客户端保留队列 | 网络/HTTP 错误不删除队列；mutation ID 支持重试 | 501 队列历史探针已覆盖；代理字节预算、浏览器实际持久队列未验证 |
| 多 tab token 轮换，N-R02-01 | tab A/B 各自请求旧 refresh → 一方写共享新 token → 另一方失败并清共享 token | 同 tab 请求有 single-flight | 跨 tab 没共享 single-flight；实际浏览器次序未跑 |

## 未执行场景和开放条件

本包不启动浏览器、不读取用户 profile、不制造 IDB 故障，也不使用真实账号。动态补证统一 `PLANNED_NOT_RUN`：

1. **F01 浏览器启动时序：** 唯一问题是有 A 有效会话与 A outbox 时，断网/慢 `/me` 首屏是否真实触发全局清理。前提为专属临时浏览器目录、合成测试账号、可控测试后端和可恢复的预置数据；观察 Auth 状态、reset/IDB 操作先后及剩余 outbox/dead-letter。真实用户浏览器数据不得使用。
2. **N-S02-01 v1→v2 / A→B：** 唯一问题是旧无 userId 行在匿名保全与 B 的 start/sync 并发时，是否会作为 B 的请求内容发出，或被匿名保全归档。前提为隔离 profile + 人工创建的无 owner v1/pre-A03 v2 schema 与合成记录 + 专用测试服务；捕获 reset/move/push 顺序、请求主体和 mutation ID，并检查 A/B/anonymous 各主体的拒绝区。当前静态已证明各分支构造路径，运行只验证浏览器调度；无法安全控制服务端时不运行。
3. **F03 页面缓存：** 唯一问题是 A 缓存、B 对同一共享项目无权或权限规则不同、B tasks API 失败时 Tasks 页面实际可见字段。需 A/B 合成账号、隔离测试项目、清空专用浏览器 profile 及受控失败响应。没有此证据，结论停留在 API 缓存与静态消费者路径。
4. **F02 浏览器 IndexedDB 故障：** 唯一问题是 outbox 删除已提交后冲突记录写失败/页面中断时，真实浏览器是否遗失 payload。需临时 profile、合成 mutation、可控 IndexedDB 写故障注入与可重启页面；无稳定失败注入机制时保持未运行，不以随机配额压力代替确定实验。
5. **F04 请求体阈值：** 501 项代码上限已由历史探针覆盖；若评估较少但大 body 的部署行为，需非敏感部署配置或专用环境 body limit。当前配置缺失，故无字节阈值结论。
6. **N-R02-01 双标签页：** 唯一问题是共享 origin/storage 下失败的旧 refresh 响应是否清除另一个 tab 刚写的新 token。需隔离 profile、合成账号、可控 refresh 端点及同 origin 双标签，不得使用真实会话。
7. **v1→v2 upgrade interruption：** 唯一问题是 upgrade transaction 被中止/页面关闭后，旧 kv/records/outbox 是否仍可读取且可重试。需专属临时 profile、人工 v1 库及可控升级中止点；本轮不对浏览器实现行为作结论。

数据库以外的升级事务故障动态验证不是静态裁定所必需；所有上述浏览器级实验均未运行。S02 保留 `COMPLETE_WITH_PENDING`，待隔离浏览器、合成服务端及所需策略/环境具备时再解锁。
