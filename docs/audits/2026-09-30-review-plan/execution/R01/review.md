# R01 · 账号管理与角色权限

状态：COMPLETE_WITH_PENDING（审阅完成，有产品策略待确认）。日期：2026-09-30。源码只读检查；没有本轮动态复现。历史H级证据与当前S级调用链一致。

## 范围与调用链

读取用户/角色路由、RBAC身份与权限装载、默认权限seed、权限常量、mass-assignment白名单，以及改密和审计直接依赖；源码SHA-256见`source-digests.json`。未读取真实`.env`或连接数据库。当前HEAD与历史基线相同。

用户和角色路由使用`authenticate`，再由`requirePermission`检查当前DB权限。普通身份从UserRole→RolePermission→Permission载入；SUPER_ADMIN走权限短路。重置入口为`PUT /api/users/:id/reset-password`，角色创建入口为`POST /api/roles`。

## B01 · P1 · SUPPORTED · ADMIN可重置SUPER_ADMIN密码并取得其身份

- **入口与前提**：有效ADMIN访问令牌。默认ADMIN权限排除十项，但不含`users.reset_password`；该码属于P0权限。[seed.js:258](../../../../../rdpms-system/backend/prisma/seed.js#L258)；[constants.js:11](../../../../../rdpms-system/backend/src/kernel/constants.js#L11)。
- **调用链**：[users.js:347](../../../../../rdpms-system/backend/src/routes/users.js#L347) → [rbac.js:49](../../../../../rdpms-system/backend/src/kernel/rbac.js#L49)。认证读取用户当前systemRole并装载权限，权限守卫只检查`users.reset_password`。目标只查id/username（359-360行），没有目标systemRole检查。随后设置新密码和`mustChangePassword=true`，再撤销refresh token（362-372行）。
- **强制改密检查**：通用认证读入`mustChangePassword`，但不据此阻断其他已授权API；`requirePermission`只查权限码。`/api/auth/password/force`检查标记仅约束该改密入口。昨天的真实JWT测试已证明新密码登录后的SUPER_ADMIN在标记仍为true时访问高权限恢复表接口返回200。
- **历史动态证据（H，非本轮运行）**：[backend-results.json](../../../../../docs/audits/2026-09-29-rdpms/backend-results.json#L1)。真实ADMIN登录JWT、数据库角色权限加载；重置返回200，新密码登录角色为SUPER_ADMIN，mustChangePassword=true时特权接口200。
- **当前源码（S）**：[reset route](../../../../../rdpms-system/backend/src/routes/users.js#L347)；[authentication](../../../../../rdpms-system/backend/src/kernel/rbac.js#L49); [default ADMIN permissions](../../../../../rdpms-system/backend/prisma/seed.js#L258)。工作树与历史基线一致。
- **保护/反证**：新密码须12位且拒绝弱口令；设置强制改密标记；撤销全部目标refresh token。这些都未阻止历史实测的角色接管。`writeAudit`在操作后调用且吞掉写入异常（[audit.js:74](../../../../../rdpms-system/backend/src/kernel/audit.js#L74)），不是严格审计。
- **事务边界**：用户更新、refreshToken更新、审计为独立调用，未在同一事务。若refreshToken步骤失败，前一步密码可能已经变更；若审计失败，接口仍可能成功。这是从代码顺序推断的故障风险，本轮未注入故障，不作为新增动态发现。
- **已证明影响**：失陷的默认ADMIN可替换SUPER_ADMIN凭据，随后取得经历史接口验证的超级管理员访问能力。保留B01 P1。
- **建议与验收**：后端重置命令检查调用者与目标角色/受保护账号；强制改密态服务端限制可访问的业务API；凭据更新、会话撤销和必需审计采用明确定义的一致提交/可恢复语义。ADMIN重置SUPER_ADMIN应拒绝且密码、会话不变；允许重置普通账号后旧会话不可刷新；强制改密会话不能调用普通业务接口。

## B17 · P2 · SUPPORTED · 合法角色code被全局黑名单拦截

- **入口与前提**：持有`roles.create`。默认ADMIN被排除此权限；SUPER_ADMIN默认持有，因此影响角色管理功能而非普通用户提权。
- **调用链**：[roles.js:63](../../../../../rdpms-system/backend/src/routes/roles.js#L63)调用`pickAllowed(body, ['code','name','description'])`并要求code/name。[massAssign.js:20](../../../../../rdpms-system/backend/src/kernel/massAssign.js#L20)先扫描全局禁止字段，再取白名单；[constants.js:183](../../../../../rdpms-system/backend/src/kernel/constants.js#L183)把code列为禁止字段。因此正常创建请求在必填校验和写入前就被拒绝。
- **历史动态证据（H，非本轮运行）**：[backend-results.json](../../../../../docs/audits/2026-09-29-rdpms/backend-results.json#L1)中B17请求返回400，错误为“创建角色: 包含禁止提交的字段 code”。当前相同源码调用顺序支持该结论。
- **保护/反证**：全局禁止code防止mass assignment，有其安全用途；不能简单删掉全局保护。角色权限更新另受`roles.assign_permissions`及P0权限白名单限制，符合未解冻P1不授予的规则。
- **已证明影响**：含有效必填code的角色创建请求返回400。保留B17 P2。
- **建议与验收**：将允许字段按命令建模；只有角色创建DTO接受code，其他命令继续拒绝非白名单字段。合法code/name创建应201；重复/格式错误code明确拒绝；客户端不能提交id、权限关系或审计字段。

## 账号与角色入口矩阵

| 操作 | 入口保护 | 本包判断 |
|---|---|---|
| 用户列表/详情 | `users.view` | 显式权限守卫。 |
| 创建用户 | `users.create`；systemRole固定MEMBER | 不接受客户端systemRole。 |
| 修改资料 | `users.update`；USER_UPDATE_FIELDS白名单 | 不能直接改systemRole/passwordHash。 |
| 启停账号 | 手动检查`users.enable`/`users.disable`；不许停用自己 | 目标systemRole未检查。ADMIN是否能启停更高等级账号需产品策略，暂不列确认漏洞。 |
| 绑定角色 | `roles.assign_user`；白名单仅SYSTEM_ROLES；DB更新在事务内 | 与自定义角色创建能力的关系待确认。 |
| 重置密码 | `users.reset_password` | B01无目标等级保护。 |
| 自行改密 | `/api/auth/password`核对旧密码 | 该接口独立处理身份密码。 |
| 首登强制改密 | `/api/auth/password/force`要求mustChangePassword | 只保护force路由；不构成全局强制门禁。 |
| 创建角色 | `roles.create`；路由要求code | B17与全局禁字段冲突。 |
| 配置角色权限 | `roles.assign_permissions`；只允许P0，SUPER_ADMIN角色固定 | 与P1冻结规则相符。 |
| 删除角色 | `roles.delete`；保护系统角色和仍绑定用户的角色 | 发现存在显式保护；本包不扩查并发删除。 |

## 待决策略与覆盖边界

1. 角色创建支持`isSystem=false`，但用户绑定路由仅接受六个SYSTEM_ROLES。自定义角色是否应绑定用户需要确认业务策略；代码事实记录在coverage中，本轮不计新缺陷。
2. ADMIN对更高systemRole账号的启停是否应拒绝需要账号治理规则；当前入口只检查users.enable/disable。
3. 本轮未重跑昨天集成探针；未审UI行为或停用后的管理员恢复流程。
4. refresh撤销失败时密码更新的部分提交风险尚未故障注入；保留为风险和验收条件。

## 本包结论

B01：SUPPORTED/P1；B17：SUPPORTED/P2；新确认发现0。R01状态COMPLETE_WITH_PENDING，表示审阅产物齐备且保留两项策略待定，不表示修复。
