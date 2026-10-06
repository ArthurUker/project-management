# RP00-T04 — refresh/auth transport 与 generation 合同

## 状态

- 静态调用链及候选合同交付：COMPLETE。
- 技术批准：T-RP-09 仍为 PROPOSED；未批准。
- 动态验证：NOT_RUN；T-RP-09 门禁条件为 VALIDATION 前 always。
- 代码实现：本任务不涉及业务代码；没有改变认证行为。
- 原审计基线：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。
- 本轮起止 HEAD：同为上述基线。源文件摘要见 `evidence/source-digest-comparison.json`。

## 现状确认

前端用 `Authorization: Bearer` 携带 access token，以 JSON body `{refreshToken}` 请求 `/auth/refresh`。tokenStore 通过同源 localStorage 共享 access/refresh token。401 过期分支仅在当前模块内使用 single-flight Promise；成功刷新无条件写共享 token 并重放 Axios 原请求，失败无条件清除共享 token 并发 session-expired 事件。请求拦截器在重放时读取当前全局 access token，因此若身份已切换，旧请求可能以当前另一个账号的 token 发送。服务端根据 refresh row 的 user 签发 access token；旧 refresh 查询、无条件撤销和新 refresh 创建是分开的操作，历史 R02 屏障证据曾观察到并发双 successor。

403 不触发 refresh；无响应网络错误不清 token；其他 401 分支会清除全局 token，且也没有代次比较。当前代码没有请求发起 actor/session generation 记录或跨 tab refresh 协调。当前 bounded source 中未发现 refresh Set-Cookie 或 axios `withCredentials`；CORS `credentials:true` 不证明 cookie 认证已支持。

## 候选联合合同

`evidence/auth-generation-matrix.json` 将源码现状与待批准目标分列。建议批准范围覆盖 initiating actor/session generation、迟到成功/失败的条件更新、原请求重放身份绑定、跨 tab 协调及服务端 CAS/family/replay 窗口、401/403/network 区分、transport/兼容窗。该条目是供命名安全/认证/前端负责人审批的草案，不构成执行者签署或产品决策。

D-S01-04 的 access JWT 密码/权限变更失效时限单独保持 PENDING；不在本任务选方案。

## 文件与影响边界

仅新增 `docs/remediation/2026-10-01-rdpms/execution/RP00/RP00-T04/` 交付材料及同步静态任务运行状态镜像。没有改前端/后端代码、API schema、数据库 schema、依赖、冻结审计目录或 v1 快照。旧工作区中的角色 DTO、测试和审计文档改动保持不动。
