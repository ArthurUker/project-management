# SUP-02 运行证据索引

- 运行器：`docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-2026-10-03/run-suite.py`
- 运行目录：`docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-2026-10-03/SUP-02/runs/rp08-suite/attempt-02/`
  - `integration-suite.log`：node --test 输出，`# tests 12`、`# pass 12`、`# fail 0`
  - `run-results.json`：命令序列、数据库名、端口、绑定 127.0.0.1、owner rdpms_exec、私有无密点环境、清理结果
  - 各阶段去敏日志：initdb/cluster-start/guard-check/guard-reset/backend-build/guard-drop/cluster-stop
- 失败尝试保留：`attempt-01`（周期键/extractOnlineRow 取到 B3 软删墓碑行，普通 API 仅返回活跃行导致断言失败；已改用活跃行 id 定位后修正），未覆盖日志。
- 测试增量位置：
  - `extractOnlineRow`：rp08 测试文件约行 611-619
  - `SUP-02`：约行 629-~710
