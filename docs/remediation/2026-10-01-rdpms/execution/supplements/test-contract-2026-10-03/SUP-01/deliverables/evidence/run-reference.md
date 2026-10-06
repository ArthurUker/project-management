# SUP-01 运行证据索引

- 运行器：`docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-2026-10-03/run-suite.py`
- 运行目录：`docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-2026-10-03/SUP-01/runs/rp10-suite/attempt-04/`
  - `integration-suite.log`：node --test 输出，`# tests 19`、`# pass 19`、`# fail 0`
  - `run-results.json`：命令序列（initdb/cluster-start/guard-check/guard-reset/backend-build/integration-suite/guard-drop/cluster-stop）、数据库名、端口、绑定 127.0.0.1、owner 角色 rdpms_exec、私有无密点环境、清理结果
  - `initdb.log`、`cluster-start.log`、`guard-check.log`、`guard-reset.log`、`backend-build.log`、`guard-drop.log`、`cluster-stop.log`：各阶段去敏日志
- 失败尝试保留：`attempt-01`、`attempt-02`、`attempt-03` 保留（attempt-01/02 为环境问题/路径错误，attempt-03 为周期键非法导致屏障未命中，均已定位并修正，未覆盖日志）。
- 测试增量位置：
  - `gateOnReportMethods` helper：rp10 测试文件约行 762-816
  - `SUP-01-01`：约行 818-865
  - `SUP-01-03 SEMANTIC_NEGATIVE_CONTROL`：约行 867+
