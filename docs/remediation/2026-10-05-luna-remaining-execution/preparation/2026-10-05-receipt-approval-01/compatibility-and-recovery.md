# 协议与最后副本边界

预约是 backend 范围中的持久状态确认，不是业务执行。首次真正新意图先 reserve（可独立回滚/重复查询同 handle），push 锁定既有 reservation。每项 business/audit/applied 转换同事务；预约提前存在不违反“业务与成功回执原子”。异常仍 pending 或之前的非成功状态，不是 receipt 缺失可重做。pending 已过期不自动续命。

客户端必须保存原 key/entity/op/id/data/base、server hash、handle；commit response 丢失仍保留原副本。查询 applied 才可按精确对应项确认；unknown/expired/legacy 不重新 reserve、不换 key、不删唯一副本。修改冲突内容必须是显式新意图，不能把同 key 改 payload 冒充重试。

**当前前端未实现以上协议**。engine.ts 的 applied 出队、conflict 删除再存、其余 status 移 dead-letter，与预约/unknown 安全恢复不是同一保证。本包不改 engine、不把后端模拟 v1 producer 当作真实 IDB 验收。自动升级旧 outbox 或给“发送史不明”的旧键补预约可能重复历史已提交无回执业务，因此禁止。

候选后端拒绝 legacy push 而非回到旧不安全路径；这有明确兼容成本。启用目标环境前须提供受支持客户端版本、停旧 tab/旧写入入口的方案和旧队列分类、RP12/T-RP-12 的真实最后副本验收。没有这些材料不部署。

reservation row id 不是秘密或权限凭证；所有 reserve/query/push/replay 都重新校验 actor/device、当前资源、成员、own-only 和动作权限。跨 actor/device/当前拒绝不泄露 receipt 内容。已删资源要按真实墓碑及当前项目授权推导 scope，不相信客户端声称的项目；硬删/恢复旧库造成无法确定身份/记录时返回未知，不把不存在当重复执行依据。

现有 device upsert 更新 label/platform，**不覆盖 userId**；已知问题是没有先核对所用 device 的当前 owner。本提案增加 ownership 拒绝，不虚构现有跨主体 userId 覆盖行为。

## 授权与事务时序的具体边界

当前 rbac.js 在请求 middleware 读取 ACTIVE 用户及角色 grant；这不是每个延迟 item 的授权快照。本方案只在同步 item 模块内使用 caller tx 重新读权威用户/角色绑定/grant/项目/成员/动作，SERIALIZABLE + resource CAS。撤销已在授权快照前提交时必须拒绝；重叠撤销/命令按可证明串行顺序处理，不声称响应前任一撤销都能取消已经排序的命令。不修改 JWT TTL/security-version、全局认证 middleware 或其它任务的撤销政策。
