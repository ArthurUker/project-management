# Actual changes

本session只改两既有文件（routes/sync.js、prisma/schema.prisma），新建syncMutationCommands.ts、20261005_sync_receipt_v1_scope迁移及两套rp09正式集成测试。详细逐任务diff位于原任务run/evidence中；最终六文件hash见evidence/final-source-hashes.json。

新增预约/query后端合同、不可变身份作用域与载荷、调用者事务内业务/CAS/严格审计/回执、24h到期与unknown恢复、当前权限回放、有限可序列化重试、delete-wins和写入禁用控制。保留冻结P1权限与共享业务命令，不修改前端、角色seed、DAG或其它HTTP政策。

旧协议不兼容是显式批准的候选合同边界：未预约push返回426。目前旧前端及19条旧wire断言未迁移；CI FAIL，尚不能发布。已有node_modules Prisma client按现有版本从自有schema重生成，属派生产物；未安装/升级依赖，未改锁文件。
