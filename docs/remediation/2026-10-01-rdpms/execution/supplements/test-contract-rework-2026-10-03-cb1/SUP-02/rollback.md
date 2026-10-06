# SUP-02 回滚说明（人工撤销范围，不执行）

本轮 SUP-02 的仓库增量只有：

1. `rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
   （起始副本 session 根 `evidence/start-copies/rp08-sync-read-authorization.integration.test.mjs.start`，
   sha256 `07e18190ee5baeee283242361b4de9854ac6e8898509d1fbcd59efa11847f211`）。
2. 本 session 的 `SUP-02/`（含 deliverables/field-comparison.csv|md、evidence、runs）。
3. 六个受控记录文件中本轮追加的条目。

人工撤销：把起始副本覆盖回该测试文件，删除本 session 的 SUP-02 目录，
并删除六文件中本轮新增条目（不触碰旧条目）。

sync.js、普通 API、前端本轮零改动，因此**没有业务回滚**；本轮不部署，不存在生产回滚验收。
