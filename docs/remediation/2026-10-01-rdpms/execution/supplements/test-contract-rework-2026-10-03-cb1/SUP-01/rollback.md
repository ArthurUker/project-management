# SUP-01 回滚说明（人工撤销范围，不执行）

本轮 SUP-01 的仓库增量只有：

1. `rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
   （起始副本 session 根 `evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start`，
   sha256 `dc5ceb9c9c409453bba2d3357f37eb68cc44e3ef2bcf956107adf330e23ff53b`）。
2. 本 session 的 `SUP-01/` 新增文档、证据与运行目录。
3. 六个受控记录文件中本轮追加的 continuation / handoff 章节 / 版本 entry。

人工撤销：把起始副本覆盖回该测试文件，删除本 session 的 SUP-01 与 runs 目录，
并删除六文件中本轮新增条目（不触碰旧条目）。

`backend/src`、`frontend/src` 本轮零改动，因此**没有业务回滚**；本轮不部署，不存在生产回滚验收。
