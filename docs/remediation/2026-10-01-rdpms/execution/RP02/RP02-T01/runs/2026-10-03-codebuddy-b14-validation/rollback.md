# RP02-T01 补验 — 回滚说明

## 本地变更撤销

本任务**未修改任何业务源文件**，只新增测试用例。撤销方式：删除
`rdpms-system/backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs` 中本轮新增内容：

- 注释块「LR2-04 补验：并发 disable/login 确定性双方向屏障 + 锁内正确/错误密码」；
- 辅助函数 `gateOn` / `makeBarrierApp` / `makeAdminUser` / `makeTargetUser` / `loginAs` / `disableAsAdmin`；
- 4 个新用例（direction 1、direction 2、锁内正确密码、锁内错误密码）。

原有 7 个用例保持不变，回退后套件回到上一轮状态（7/7 通过）。

## 数据与 schema

- 无迁移、无字段变化；运行副作用只在自有一次性 `rdpms_test_*` 库（已 guard drop、集群已停止）。
- 合成用户保留到整库 drop（append-only 审计需要），不做用户级删除。

## 安全边界

- 撤销只影响测试覆盖，不影响任何运行时行为。
- 生产/目标环境回退演练未执行 → `NOT_RUN`；未提交、未部署。
