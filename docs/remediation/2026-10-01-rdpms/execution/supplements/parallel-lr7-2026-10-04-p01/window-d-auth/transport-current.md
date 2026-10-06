# transport-current.md

权威静态口径：当前认证 transport（与 `RP00-T04/evidence/auth-generation-matrix.json` 一致，本轮以当前文件行号 + SHA256 重新核对，未重跑）。

## 1. Access token

- **产生**：`signAccessToken(user)`（`backend/src/kernel/rbac.js:40-44`）签发 JWT，载荷仅 `{userId, systemRole}`，不携带权限数组（防篡改）。TTL 来自 `JWT_ACCESS_TTL`/`JWT_ACCESS_TTL_SEC` 或默认 900s。
- **产生点（登录）**：`/login`（`auth.js:251`）返回 `accessToken` 及兼容字段 `token`（`auth.js:271`）。
- **发送**：请求拦截器（`frontend/src/api/http.ts:31-37`）每请求从 `tokenStore.getAccessToken()` 取令牌并设 `Authorization: Bearer <token>`。**Bearer 头是唯一 access 传输通道。**
- **消费**：`authenticate()`（`rbac.js:56-115`）读取 `Authorization Bearer`，`jwt.verify` 后加载用户并校验 `status=ACTIVE`。
- **存储**：`tokenStore.setTokens`（`tokenStore.ts:33-40`）写入 `localStorage` 键 `rdpms.accessToken` / `rdpms.refreshToken`。**localStorage 是唯一令牌仓库，无 httpOnly cookie。**

## 2. Refresh token

- **产生**：`issueRefreshToken`（`auth.js:31-44`）生成 48 字节随机 hex，存 `sha256(raw)`，`familyId` 每次随机 UUID，默认 7 天 TTL。
- **发送**：`POST /auth/refresh` 以 **JSON body `{refreshToken}`** 发送，使用裸 axios 绕过共享响应拦截器（`http.ts:85-101`）。**body 传输，非 cookie。**
- **消费/轮换**：`/refresh`（`auth.js:280-304`）校验未吊销/未过期/`user.status=ACTIVE`，随后**无条件吊销旧令牌**并签发新 access + 新随机 family 的 refresh。
- **存储**：`refreshAccessToken` 成功后将响应直接写入 `tokenStore.setTokens`（无发起者/代际校验，`http.ts:100`）。

## 3. Cookie transport 反证（PC01 / COMMON_RULES §4）

有界前端/后端认证路径**未发现任何 `Set-Cookie` 或 `withCredentials`**。后端 CORS `credentials:true` 与部署层 cookie 旗标只是配置，**不构成 cookie 认证实现**。结论：cookie 不是当前受支持的认证传输。任何“实际 cookie 支持”都需显式实现 + 动态验证，不能由 CORS 旗标推定。

## 4. 层次与边界

- 层次：`SOURCE_STATIC_REVIEW`。当前文件行号 + SHA256（见 `evidence/source-facts.md`）。
- 本轮真实 JWT/IDB/UI 验证：`NOT_RUN`。
- 本文件**不批准** T-RP-09、PC01、D-S01-04 或任何门禁；仅固化“当前实际 transport”事实供具名负责人决策。
