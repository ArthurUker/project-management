# RP01-T01 scalar DTO rework — 2026-10-02

关联LR-03及旧B17；本任务仅修改 `backend/src/routes/roles.js` 和角色创建集成测试。

角色创建的code/name必须是字符串，name不可空白且不超过当前数据库varchar(128)长度，code仍用原大写字母/数字/下划线正则及64字符界限。description只接受字符串或null。拒绝发生在Prisma调用前。全局 `GLOBAL_FORBIDDEN_FIELDS` 未改；id、权限关系、audit/system字段仍由创建命令白名单和禁用字段检查保护。未改变角色绑定、权限分配、seed、schema或迁移。

现有合法/duplicate/invalid/injection断言保留；增加数组、对象、数值、空白及非法description负例，检查无额外角色/关系行。构建和真实隔离DB/HTTP集成suite通过，详见 `evidence/attempt-01/`。
