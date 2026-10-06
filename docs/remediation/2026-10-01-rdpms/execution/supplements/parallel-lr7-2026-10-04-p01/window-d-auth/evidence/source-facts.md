# evidence/source-facts.md — 源码事实锚点（SHA256 + 行号）

层次：SOURCE_STATIC_REVIEW。以下文件为只读追踪对象，本窗口未修改。

| 文件 | SHA256 | 关键行 | 事实 |
|---|---|---|---|
| rdpms-system/backend/src/routes/auth.js | 8f736619a1526247073697865490a6fef67053f92c501fbe65f617b29b3f12b4 | 31-44 issueRefreshToken | 随机 48 字节 hex refresh，sha256 存储，随机 familyId，7d TTL |
| 同上 | 同上 | 103-277 /login | 登录签发 access + refresh，返回兼容字段 token |
| 同上 | 同上 | 251 signAccessToken | access 由 rbac.signAccessToken 签发 |
| 同上 | 同上 | 280-304 /refresh | 校验未吊销/过期/ACTIVE；无条件吊销旧 + 新随机 family successor |
| 同上 | 同上 | 307-328 /logout | 吊销传入 refresh；需 authenticate |
| 同上 | 同上 | 372-375 改密吊销 | 改密吊销全部 refresh（D-S01-04 范畴） |
| rdpms-system/frontend/src/api/http.ts | ddc1df339ee119566375a32e36c94d6cae7c89b05aea4142749a20e80882d9a7 | 31-37 请求拦截器 | Bearer 头注入（唯一 access 传输） |
| 同上 | 同上 | 78-108 refresh 单飞 | 模块级 inflight Promise；裸 axios POST /auth/refresh body |
| 同上 | 同上 | 100 setTokens | 响应直接写全局 tokenStore，无发起者校验 |
| 同上 | 同上 | 111-156 响应拦截器 | 401+AUTH_EXPIRED/INVALID_TOKEN 重放一次；403 仅抛错；无响应→NETWORK_ERROR |
| rdpms-system/frontend/src/auth/tokenStore.ts | ee009d10b1225d799d5adfc41ffde972e628961ab776028944d9dffac3782266 | 16-65 get/set/clear/hasSession | localStorage 唯一令牌仓库；清理由 catch 无条件触发 |
| rdpms-system/backend/src/kernel/rbac.js | 99ca8177a7c6aed2f4cf820e7bb82ae572c516d2647aec1366dbfcce9695ce2f | 40-44 signAccessToken | JWT 载荷仅 {userId,systemRole} |
| 同上 | 同上 | 56-115 authenticate | Bearer 消费；校验 status=ACTIVE；不消费 passwordChangedAt/代际 |
| rdpms-system/frontend/src/auth/AuthProvider.tsx | b16e610ddc4367fb6f8bf1b0c5531ea6c507db9b1f630012d47b21eeb2cf7617 | 80-88 login | 登录直接 setTokens（无代际守卫） |
| 同上 | 同上 | 91-99 logout | 登出无条件 clear |

**Cookie 反证**：有界前端/后端认证路径无 `Set-Cookie` / `withCredentials`；CORS `credentials:true` 不构成 cookie 认证实现。
