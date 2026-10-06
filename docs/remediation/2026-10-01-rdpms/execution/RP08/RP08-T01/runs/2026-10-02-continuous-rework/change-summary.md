# RP08-T01 — 普通同步读取权限

基线 HEAD 保持 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`；保留工作区原差异。`sync.js` 为每个同步实体登记独立 readPermission 与 readFields；按用户实体查看权限跳过未授权实体查询，成员/负责人项目范围继续使用，且仅具 read capability 的有效项目成员进入项目流；reports 保留 authorId own-only。响应 upsert rows 用显式字段投影，project manager 仅带 id/displayName。未请求 registration 全局例外。

测试创建实际 synthetic ADMIN 用户、MEMBER/VIEWER成员项目、tasks/reports/phase/milestone/progress/member真实行。actorResolver 是可信测试身份注入，不等价完整JWT认证链。用例证明允许实体成功、拒绝实体不回传、七类实体投影按权限返回、任务字段排除 createdById/deletedAt、project 字段排除 metadata、report仅作者可读、非成员项目列表为空。
