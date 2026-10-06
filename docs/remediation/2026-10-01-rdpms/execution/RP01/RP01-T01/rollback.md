# RP01-T01 本地回退边界

## 本地源文件回退

若后续决定撤销本地改动，应仅反向应用本任务 `roles.js` diff（原文件起始 SHA 位于 R01 冻结证据 / R01 source digest）并删除新增的 `tests/integration/b17-role-create.integration.test.mjs`。执行前先核对当前差异归属；不得 reset/checkout 整个工作区，不得覆盖用户或后续任务改动。没有提交，因此不存在 commit 回退。

## 数据及发布

无 schema/migration 变化。临时 `rdpms_test_*` 数据库已通过 guard 删除，临时 PG 已停止。正式、共享或生产环境从未访问。目标环境回退/部署演练均 NOT_RUN；release NOT_EVALUATED。不能据此宣称任何目标环境具备可验证回滚能力。
