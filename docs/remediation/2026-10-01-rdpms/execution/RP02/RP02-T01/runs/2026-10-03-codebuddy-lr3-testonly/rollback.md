# RP02-T01 TEST_ONLY — 回滚说明

## 本地变更撤销

本任务未修改业务代码，只需删除本轮新增的单个用例：
文件 `rdpms-system/backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs`，
删除注释块「C（TEST_ONLY）：固化独立复核的『条件更新前停用』屏障」与用例
`RP02 LR3-01 C01 the conditional login reset is refused when an administrator disables the account first`。
既有 11 个用例（入口读前停用、登录先完成、锁内正确/错误密码、状态/期限/TTL）保持不变。

## 数据与 schema

无迁移、无字段变化；合成账号随自有一次性 rdpms_test_* 库整体 drop。append-only 审计不删除、不关闭 trigger；
合成账号保留到整库 drop，不做行级删除。

## 安全边界

撤销只影响测试覆盖，不改变任何运行时行为。生产/目标环境回退演练未执行 → NOT_RUN；未提交、未部署。
