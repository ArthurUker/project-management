# R02 — 登录锁定与令牌轮换

- 包状态：`COMPLETE_WITH_PENDING`
- 审计 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`（与计划基线相同）
- 审阅范围：登录失败锁定、账号状态检查、refresh rotation、TTL响应、前端刷新竞争、登出/改密/重置/角色调整后的会话语义。
- 动态验证：`HISTORICAL_ONLY`。本轮未运行锁定、刷新并发或浏览器实验；B14/B15沿用历史隔离证据。

## 入口和状态约束

| 用户状态 | 登录入口 `auth.js` | 普通认证入口 `rbac.js` | 结果/保护 |
|---|---|---|---|
| `ACTIVE`, 无未来 `lockedUntil` | 继续校验密码 | JWT有效后允许认证 | 错误密码增加计数；正确密码将失败计数清零、清`lockedUntil`并签发会话 |
| `ACTIVE`, 未来 `lockedUntil` | 返回`ACCOUNT_LOCKED` | 若已有有效JWT仍按当前状态`ACTIVE`接受 | 临时锁定只在登录路由检查；既有access token不受`lockedUntil`影响 |
| `LOCKED`, `lockedUntil`未到期 | 返回`ACCOUNT_LOCKED` | 因状态非`ACTIVE`而拒绝 | 到期时间不会自动将status改回`ACTIVE` |
| `LOCKED`, `lockedUntil`已过期/null | 仍返回`ACCOUNT_LOCKED` | 因状态非`ACTIVE`而拒绝 | 需要管理入口将状态改回`ACTIVE`；改密清`lockedUntil`但没有将status改为`ACTIVE` |
| `DISABLED` | 返回`ACCOUNT_DISABLED` | 因状态非`ACTIVE`而拒绝 | 用户状态管理写`ACTIVE`/`DISABLED`并清锁字段 |
| `PENDING_ACTIVATION` | 当前登录路由没有专门拒绝该状态 | 登录成功后普通认证仍拒绝，因为仅接受`ACTIVE` | 当前审阅到的用户创建/状态管理入口没有设置该状态；可达设置来源未确认，列为覆盖限制，不形成发现 |

登录状态检查顺序见 [auth.js:110-169](../../../../rdpms-system/backend/src/routes/auth.js#L110)：软删用户查询不到；随后依次检查`DISABLED`、`LOCKED`或未来`lockedUntil`，再比较密码，失败时读当前计数并写回，正确密码后清零并签发token。阈值是5次、锁15分钟（[auth.js:132-142](../../../../rdpms-system/backend/src/routes/auth.js#L132)）。达到阈值同时写`status=LOCKED`和未来时间；到期并不会清除`LOCKED`状态。管理员状态入口允许改回`ACTIVE`并清计数/时间（[users.js:261-297](../../../../rdpms-system/backend/src/routes/users.js#L261)）。因此旧B14是“临时锁定被持久状态覆盖”的问题，恢复需管理干预。

失败计数使用先读`user.failedLoginAttempts`、后按绝对值更新，而不是数据库原子递增（[auth.js:111,132-143](../../../../rdpms-system/backend/src/routes/auth.js#L111)）。并发失败请求可能基于同一旧计数写入相同新计数；本轮未做受控交错，未把这一影响扩展成新发现。状态枚举另有`PENDING_ACTIVATION`（[schema.prisma:30-35](../../../../rdpms-system/backend/prisma/schema.prisma#L30)），但代码内未找到能设置该状态的当前写入口。

## 令牌签发、轮换与客户端时序

```text
登录 /auth/login:
密码正确 → 清失败状态 → 签access(JWT_ACCESS_TTL) → 插入refresh(hash, familyId=random UUID, expiresAt) → 返回 expiresIn=7200

刷新 /auth/refresh（历史同一token的两请求交错）:
请求A: SELECT旧refresh ───────── UPDATE revokedAt ─ 签access ─ INSERT新refresh ─ 200
请求B:          SELECT旧refresh ─ UPDATE revokedAt ─ 签access ─ INSERT另一个新refresh ─ 200
                     两次读取都发生在首次撤销前时，两个请求均可继续

前端同一tab:
401 → 模块级 inflight Promise 合并 → refresh → 写access+refresh到localStorage → 原请求重放

前端不同tab:
tab A、B各有自己的 inflight；二者可读取同一localStorage refresh并分别请求。
若A先轮换并存入新refresh，B的旧refresh请求随后失败，B的失败处理会清空共享localStorage，可能删除A刚存的新会话。
```

后端旧refresh读取、有效性检查、撤销、access签发、新refresh插入及审计是独立调用，并未处于一个事务中（[auth.js:197-216](../../../../rdpms-system/backend/src/routes/auth.js#L197)）。撤销是按id的无条件update，没有`revokedAt:null`条件和受影响行数仲裁；`familyId`每次签发时重新随机生成，子token没有继承父family（[auth.js:30-42](../../../../rdpms-system/backend/src/routes/auth.js#L30)；[schema.prisma:505-520](../../../../rdpms-system/backend/prisma/schema.prisma#L505)）。历史受控交错观察到旧token的两个后继均创建。若已撤销旧token后新token插入或审计抛错，操作可能失败但旧token已失效；这一失败路径本轮未运行。

access TTL由`JWT_ACCESS_TTL`、`JWT_ACCESS_TTL_SEC`或默认900秒解析（[rbac.js:20-43](../../../../rdpms-system/backend/src/kernel/rbac.js#L20)；[.env.example:27-28](../../../../rdpms-system/backend/.env.example#L27)）；登录/刷新响应却都固定返回`expiresIn:7200`（[auth.js:183-193](../../../../rdpms-system/backend/src/routes/auth.js#L183)、[auth.js:197-216](../../../../rdpms-system/backend/src/routes/auth.js#L197)）。HTTP客户端不读取该字段，只校验token存在、遇认证过期错误时触发刷新（[http.ts:82-107](../../../../rdpms-system/frontend/src/api/http.ts#L82)）。因此TTL不准确是API契约缺陷，当前查到的前端刷新行为并不依赖这个响应值。

## 登出、改密、重置与角色变更

- 登出请求带refresh token时仅撤销该token；不传token仍返回成功，前端会清本地token（[auth.js:220-241](../../../../rdpms-system/backend/src/routes/auth.js#L220)；[AuthProvider.tsx:90-99](../../../../rdpms-system/frontend/src/auth/AuthProvider.tsx#L90)）。服务端没有access-token黑名单；当前access JWT在自身过期前仍有效。
- 自助改密与管理员重置都先更新密码/`passwordChangedAt`，再分开撤销目标用户所有未撤销refresh token；不是同一事务。强制改密状态只在对应路由校验`mustChangePassword`，认证中间件未阻止这类用户访问其他业务路由（本项也在R01/B01记录；此处仅说明会话边界）。见[auth.js:261-320](../../../../rdpms-system/backend/src/routes/auth.js#L261)、[users.js:346-385](../../../../rdpms-system/backend/src/routes/users.js#L346)。
- 改密/重置后已经签发的access JWT不会立即失效：`passwordChangedAt`虽持久化，但`authenticate`只验证签名、加载用户，并只因用户不存在或`status !== ACTIVE`拒绝；它不比较JWT签发时间与`passwordChangedAt`，也没有会话版本/黑名单（[rbac.js:49-107](../../../../rdpms-system/backend/src/kernel/rbac.js#L49)；[schema.prisma:404-419](../../../../rdpms-system/backend/prisma/schema.prisma#L404)）。在最大access TTL内旧access仍可访问。这是本包新增的源码确认问题 N-R02-02，范围限定为密码变更后的access会话撤销缺口；具体可接受的失效时限需要产品/安全策略确认。
- 角色绑定更新数据库中的`systemRole`和`UserRole`；每个请求认证时按当前数据库用户和角色绑定加载权限，因此后续请求的后端权限会使用新值，不依赖JWT内签发时的角色声明（[users.js:300-343](../../../../rdpms-system/backend/src/routes/users.js#L300)；[rbac.js:69-107](../../../../rdpms-system/backend/src/kernel/rbac.js#L69)）。该路径没有撤销refresh/access token，但没有发现后端权限继续沿用旧角色的证据；前端显示的用户/权限状态仅通过`refreshUser`主动刷新，本轮没有跨会话通知证据。
- token存储使用同源`localStorage`，refresh single-flight仅是当前模块实例的内存Promise（[tokenStore.ts:10-49](../../../../rdpms-system/frontend/src/auth/tokenStore.ts#L10)；[http.ts:78-107](../../../../rdpms-system/frontend/src/api/http.ts#L78)）。失败分支无条件清token并发会话失效事件（[http.ts:128-151](../../../../rdpms-system/frontend/src/api/http.ts#L128)）。多个tab共享token值但不共享single-flight，可产生跨tab覆盖/误登出。本轮新增N-R02-01，静态调用链结论，未运行真实浏览器。

## 旧发现裁定

### B14 — `SUPPORTED / P1`，`HISTORICAL_ONLY`

历史报告/结果显示临时锁到期后用正确密码仍返回403 `ACCOUNT_LOCKED`（`docs/audits/2026-09-29-rdpms/backend-results.json#B14_EXPIRED_LOCK_STILL_REJECTED`）。本轮源码确认：失败达到5次时状态被置为`LOCKED`；登录检查先因`status==='LOCKED'`短路，15分钟过后也没有自动将状态恢复；普通认证入口同样拒绝非`ACTIVE`。管理员状态接口能人工恢复，故严重度仍P1但“永久”仅表示无自动到期恢复，不是不可人工解除。未重复历史实验。

### B15 — `SUPPORTED / P2`，`HISTORICAL_ONLY`

历史受控交错证明相同refresh token两次读取都在撤销前完成时，两请求都返回200、创建两个后继token；同一历史运行观察到签发TTL为900秒但响应声明7200秒（`backend-results.json#B15_REFRESH_PARALLEL_REUSE`）。当前源码保留非原子read→unconditional revoke→issue链、固定TTL响应及独立family UUID，未见反向保护。前端同tab有single-flight，能减少同一tab由并发401触发的重复刷新，但不能约束跨tab或其他客户端；不推翻后端B15。

## 新发现

### N-R02-01 — 跨tab refresh失败可清除已轮换的新会话（P2，静态确认）

- 入口/前提：同源多个tab持有同一refresh；各tab内的access请求同时过期或触发refresh。每个tab的`http.ts`有独立模块状态`inflight`，token从共享localStorage读取。
- 调用链：旧token被tab A刷新并写入新token → tab B对已消费旧token刷新失败 → `catch`无条件`tokenStore.clear()`，清除共享存储中的新token并广播失效。
- 影响：仍有效的A会话可能因B失败而被客户端清除，导致用户被登出并丢弃尚未发送的请求体验；没有证据表明该路径让未授权者取得访问权限。
- 保护/反证：同一tab single-flight能合并一个JS实例里的多个401；不同tab不共享Promise。服务器单token消费规则会让输家明确失败，但客户端失败清理缺少“比较旧token/会话代次后再清”保护。
- 证据：当前源码`http.ts:78-107,128-151`、`tokenStore.ts:10-49`。无历史动态证据，本轮未运行浏览器。
- 建议：跨tab共享refresh协调（例如以锁/广播协调单次轮换），失败清理前核对本次失败所用refresh是否仍是当前存储值；考虑服务端短暂幂等重放窗口。验收用两个真实浏览器上下文交错响应，确保先成功存入的新token不会被旧请求失败清除。

### N-R02-02 — 改密/管理员重置未即时撤销已签发access JWT（P2，静态确认）

- 入口/前提：账号有尚未过期access JWT，之后通过`PUT /api/auth/password`或有权管理员调用`PUT /api/users/:id/reset-password`修改密码。
- 调用链：密码字段和`passwordChangedAt`更新，所有refresh行被撤销；先前access JWT仍可通过`jwt.verify`，认证中间件没有检查`passwordChangedAt`、access会话版本或撤销表，只检查用户存在和状态为ACTIVE。令牌继续有效到其自身`exp`（配置示例/default为15分钟）。
- 影响：仅撤销refresh并不等于撤销全部会话；发生凭据重置时，持有既有access JWT的一方在access剩余有效时间内仍能继续调用受保护API。历史B01 reset影响已包含“能以新密码取得SUPER_ADMIN身份”的情况，此条聚焦另一个会话生命周期根因，不重述权限越界本身。
- 保护/反证：被停用/锁定的账号每请求均被拒绝；角色/权限重新从数据库加载，故角色调整能较快收敛。密码变更不会改变status，且`passwordChangedAt`当前没有认证消费点。
- 证据：当前源码`auth.js:261-299`、`users.js:346-385`、`rbac.js:49-107`、`schema.prisma:404-419`。静态调用链足以确认“未即时撤销”；本轮未做动态请求验证。最大具体剩余时长依部署的access TTL而定。
- 建议：先定义重置/自助改密的会话合同。若要求即时失效，可增加可在每请求检查的会话版本/`iat`策略，或服务端session标识；令密码更新、refresh撤销和审计保持可恢复的一致状态。验收在旧access和refresh同时仍在手中执行改密后，两者均按合同立即拒绝；正常新登录成功。

## 覆盖边界、待决问题与验收条件

- 未覆盖：`PENDING_ACTIVATION`写入来源、真实多tab行为、数据库竞争语义、token撤销失败注入、跨部署JWT时钟偏差。原因：当前包规定继承历史及源码审查、不对真实账号做锁定实验；没有源码变更或静态关键语义缺口需要新动态测试。
- Pending：确认安全策略是否要求管理员重置/自助改密后立即使既有access会话失效，以及目标失效时限。故包状态`COMPLETE_WITH_PENDING`。
- B14验收：前4次失败不锁；第5次触发策略；到期后正确密码可自动恢复或由明确的人工解锁流程恢复；停用账号仍拒绝；成功登录重置失败计数。
- B15验收：同一token仅允许一个旋转胜者（另一个请求不签发后继）；已消费token重放按family策略处理；失败时无旧token已失效而新token/结果不可观察的悬挂状态；响应TTL和JWT实际`exp`一致。
- N-R02-01验收：跨tab受控响应交错时，旧refresh的失败回包不能清除更新后的token；并验证无效/被撤销且仍为当前值的refresh会正确登出。
- N-R02-02验收：按裁定合同验证已签access是否即时失效，包含管理员reset、自助change、角色变化和账号停用的差异。
