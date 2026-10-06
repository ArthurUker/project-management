# RP02-T01 scoped rework — 2026-10-02

关联：LR-01/LR-02/LR-05、旧B14；原B15的refresh单次消费范围未触碰。原源码起始状态是HEAD 138cf2da1b63195cef7e884f69bdf8ded6ed3c21加工作区RP02实现；本run只改 auth.js 和 rp02-login-lock-ttl.integration.test.mjs。

- PENDING_ACTIVATION错误密码计数达到5时保留该status，但写入15分钟lockedUntil；失败计数条件也排除尚未到期的既有lock。登录入口现有lockedUntil检查统一执行锁定，不改变激活策略。
- 成功认证更新后重新读取用户行，用更新后的行签发token和生成响应；过期LOCKED恢复后返回ACTIVE。若读取时账号已DISABLED则拒绝继续。
- 测试不逐例删除带审计的合成用户；每例随机用户保留到自有测试库drop。新增待激活状态的计数、锁、到期、保持PENDING及审计locked/attempts断言。
- 未修改schema、迁移、依赖、refresh轮换/family、角色规则或其他业务文件。

详细hash与可重现命令在 evidence/；第1次运行的失败日志保留于 evidence/attempt-01，最终第2次运行记录在 evidence/attempt-02。
