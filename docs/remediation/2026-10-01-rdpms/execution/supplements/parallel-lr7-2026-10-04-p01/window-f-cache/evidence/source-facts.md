# 当前源码事实（只读引用，带行号与 SHA256）

> 仅用于方案的事实锚点；本窗口不修改这些文件。哈希取自工作区当前文件（与 BATCH_MANIFEST 冻结基线比对：backend/src/routes/sync.js 一致 `ad41610…`）。

## 后端：rdpms-system/backend/src/routes/sync.js

SHA256 `ad41610a6036f054533e663089f1584a9c9730a8264c2a62f39448add7672c7f`

| 主题 | 行号 | 事实 |
|------|------|------|
| `GET /init` 入口 | L369 | 增量拉取主入口 |
| `upperBound` 取值 | L389/L395 | `upperBound = new Date()`（请求时刻），非提交顺序点 |
| 页范围过滤 | L349–L366 (`streamPageWhere`) | `{ [tsField]: { gt: since, lte: upperBound } }` —— 仅时间戳区间，无提交顺序证明 |
| 返回 `cursor` | L486 | `hasMore ? since : upperBound` |
| 分页要求 | L479–L481 | 非末页且 `paginationVersion!==1` 抛 409 `SYNC_PAGINATION_REQUIRED` |
| ACL 版本计算 | L302–L308 (`aclVersionOf`) | `sha1(projectIds|permissions)` 前 16 位 |
| 可见项目投影 | L404–L413 | `projectVisibilityFilter(auth)` + `findMany` 计算 `projectIds`；每 `/init` 请求重算（分页每页独立调用 → ACL 每页重查） |
| 页令牌签名 | L315/L317–L321 (`SYNC_PAGE_TOKEN_SECRET`/`signPageState`) | 密钥 `JWT_SECRET` 或进程随机；HMAC-SHA256 |
| 页令牌校验 | L323–L347 (`readPageState`) | 校验 `actorId===auth.userId`、`deviceId`、版本=1、时间范围；**无 epoch / scope-version 绑定** |
| 当前协议缺失 | — | 无 source revision、无发布序列、无 outbox 表参与同步读路径 |

## 前端：rdpms-system/frontend/src/offline/engine.ts

SHA256 `83f86f613d23e657e6f0de95a149399cbd4d82abb15362337a234811203c7f11`

| 主题 | 行号 | 事实 |
|------|------|------|
| outbox 入队 | L171–L181 (`enqueueChange`) | 本地变更唯一入口；带 `userId` 归属 |
| 落盘应用 | L189–L239 (`applyPull`) | 镜像/墓碑写入；`cursor` 仅末页提交（L266 `!hasMore`） |
| ACL 变化清除 | L217–L236 | `aclVersion` 变化则清除不可见项目本地数据并写新 acl 快照 |
| 会话代次 | L114/L448/L530 (`sessionGen`) | 账号切换/登出使在途同步作废（A03） |
| 冲突处置 | L370–L382 (`resolveConflict`) | server=采用服务端；local=以服务端时间为基线重推（新 clientMutationId） |
| 拒绝重试 | L390–L401 (`retryRejection`) | 复用原 id/payload，服务端按当前权限重判 |
| 拒绝放弃 | L426–L430 (`dropRejection`) | 删持久拒绝区记录 |
| 拒绝取回 | L417–L423 (`getRejectedPayload`) | 取回被拒内容（复制/另存） |
| 登出保全 | L525–L551 (`resetOnLogout`) | 未同步 outbox 转入持久拒绝区；`clearAll` 不清拒绝区 |
| 他人隔离 | L558–L575 (`isolateForeignOutbox`) | 账号切换时他人变更按原主体转入拒绝区 |
| 当前缺失 | — | 无 oversize / quarantine 分支；无 epoch / `RESET_REQUIRED` 游标；无 unknown receipt 状态 |

## 前端：rdpms-system/frontend/src/api/endpoints/sync.ts

SHA256 `86bdcb749aed588e158aed887bd3a8362fb19a388970a603b58d983e128fd159`

- `SyncInitResponse`（L48–L56）：`serverTime`/`cursor`/`full`/`acl{projectIds,permissions,aclVersion}`/`entities`/`changes`/`pagination{hasMore,nextPageToken}` —— **无 `epoch` 字段**。
- `SyncPushResult`（L33–L46）：`status: applied|conflict|rejected`；无 `unknown`/`oversize`/`quarantine` 状态。
