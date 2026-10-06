# decision-draft.md — T-RP-09 可审批推荐合同

- **决策引用**：`T-RP-09`（类型 TECHNICAL_DESIGN，状态 `PROPOSED`）。
- **窗口**：D（`PROPOSED_APPROVAL_PREPARATION_ONLY`）。
- **基线 HEAD**：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。
- **父任务**：`RP00-T04`、`RP02-T02`、`RP03-T01`、`RP11-T01`。
- **联合合同**：`PC01`、`PC04`、`PC09`。
- **状态**：`PROPOSED`；`approvedBy/approvedAt/evidenceRef` 均为 `null`；签名均为 `null`。

> 本文件仅固化“维持或调整现有 transport 的准确选择、single-use/family 失败语义、前端 generation fence 与重放归属、兼容与回退”，并提交给具名负责人决策。不代签任何门禁。

## 1. 维持或调整现有 transport（精确选择）

| 维度 | 推荐 | 依据 |
|---|---|---|
| Access 传输 | **维持** Bearer 头，每请求由 `tokenStore` 注入（`http.ts:31-37`），服务端 `authenticate()` 消费（`rbac.js:56-115`） | OBS-01/05 事实 |
| Refresh 传输 | **维持** `POST /auth/refresh` JSON body `{refreshToken}`，裸 axios 绕过拦截器（`http.ts:92`） | OBS 事实 |
| Cookie 传输 | **维持为“不支持”**：有界源码无 `Set-Cookie`/`withCredentials`；CORS `credentials:true` 是配置不是 cookie 认证实现 | COMMON_RULES §4 / PC01 |
| 配置选择器 | **维持** `VITE_API_BASE_URL`、`JWT_ACCESS_TTL/_SEC`、`JWT_REFRESH_TTL` 为 transport 无关配置 | — |

## 2. single-use / family 失败语义（server refresh）

- **当前服务端**：`/refresh` 无条件吊销旧令牌并签发新随机 family 的 successor（`auth.js:288-290`）。R02 在受控交错下记录到**两个并发 successor**（OBS-02）。
- **待具名安全/认证负责人选择**（PC01 §合同，须与服务端 CAS/family 重放策略 + 客户端并发/重试窗口**共同批准**）：
  - (a) 严格单次消费：已吊销/已轮换 family 的二次 refresh 以专属码（如 `REFRESH_TOKEN_REPLAYED/STALE`）拒绝，存活代际为首次 successor；或
  - (b) 宽松 family 重放：交错 successor 短暂都接受并文档化重复窗口。
- **失败清理必须按 lineage 归属**：仅当失败的 refresh token/generation 仍拥有当前存储时才清理（修复 OBS-03 陈旧失败擦除 successor）。

## 3. 前端 generation fence 与重放归属

必须（修复 OBS-04/OBS-05）：
1. 为**每个受保护请求及其 refresh 操作**捕获不可变的发起 actor（userId）与 session generation；
2. 仅当发起会话代际仍“当前”才接受 refresh **成功**；陈旧成功**绝不**覆盖后续登录或切换账户（OBS-04）；
3. 仅当失败 lineage 仍拥有当前存储才执行 refresh **失败**清理（OBS-03）；
4. 重放**只在发起 actor/session 代际下进行**；若身份已变，**fail-closed**，不以新用户凭据发送原请求（OBS-05）。

推荐 fence：在派发时把发起 actor/session generation 挂到 Axios request config；401 重放分支重读同一捕获代际，若全局代际已偏离则中止。

## 4. 兼容与回退

- **维持**响应处理：`401 + AUTH_EXPIRED/INVALID_TOKEN` 触发**一次**有界 refresh（`http.ts:129-134`）；`403` 保持授权拒绝、不清理/不刷新（`http.ts:153-154`）；网络/离线 → `NETWORK_ERROR`，不清理令牌、不以 auth 失败呈现（`http.ts:118-126`）。
- 由具名审批人基于证据登记**受支持 transport/客户端、兼容窗口、残余风险、批准日期/证据**（PC01）。CORS 旗标 ≠ cookie 传输支持。

## 5. 仍需具名负责人填写（设计选择）

- 跨 tab 协调与回退行为（PC01 服务端 CAS/family 重放 + 客户端窗口）；
- refresh 单次消费、family 重放/盗用响应、轮换重试/幂等窗口、失败恢复语义；
- 前端 generation fence 存储形态（按请求内存 config vs 持久化 session generation）与 fail-closed 触发；
- 受支持客户端/transport、兼容窗口、残余风险、批准日期/证据；
- **D-S01-04 仍为独立 PENDING 门禁**（改密/重置/降权后 access JWT 失效），T-RP-09 不代选。

## 6. 非声明

- 不批准 T-RP-09 / PC01 / PC04 / PC09 / D-S01-04；
- 不实施或验证 RP02-T02 / RP03-T01 / RP11-T01；
- 不关闭 B15 / N-R02-01 / N-R02-02 / S02-OPEN-05 / S02-OPEN-01/02 / D-S01-04；
- 本窗口无浏览器/数据库/JWT/IndexedDB/build/目标环境执行。
