# CLOSE-01 回滚说明（人工撤销，不执行）

- 仓库增量只有 `rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`：把 `evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start`
  （SHA256 `95b70b11ab1b67021a07aebd6b02aca341f735b2926d969657310a183aa75c30`）覆盖回该文件即可回到启动状态。
- 本 session 的 `CLOSE-01/` 目录与运行日志可整体删除。
- 六个受控记录文件中本轮追加的 continuation/末节/订正 entry 可删除（不得改动旧条目）。
- 不涉及业务源码（改动数 0），无业务回滚；未部署，无生产回滚。
