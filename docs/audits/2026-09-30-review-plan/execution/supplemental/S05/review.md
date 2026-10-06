# S05 · 备份恢复与候选发布环境证据

状态：COMPLETE_WITH_PENDING。基线/审阅 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本包定向复核 R12/R13 当前材料、备份/部署脚本及仓库内可见运维文档。没有读取真实 `.env`，没有连接 DB/主机、执行脚本、恢复数据或进行发布。未发现足以改变既有裁定的新证据；`findings.json` 为空，B13/D01/D02/D03 保持原裁定，R12-N01 保持 PENDING。

## 核对结果

- **D01**：历史隔离证据为 macOS 快照别名场景；当前 `backup-pg.sh:68-77` 仍先对 `latest` 做 `cp -al`，再对快照做 `rsync --delete`。没有目标 Linux/文件系统、`cp`/`rsync` 版本和两轮 Linux 字节/摘要结果。本包不把 macOS 行为外推到目标 Linux/生产。
- **R12-N01**：当前脚本 `backup-pg.sh:52-77` 先 dump/校验 DB，再采集 uploads；脚本本身未显示写入屏障或共享 checkpoint。仓库未找到可验证的调度写入协调配置或配对快照 runbook。运行时是否可并发写入、是否由脚本外协调仍未知，因此维持候选 PENDING；未做合成 DB+文件配对恢复演练。
- **B13**：继承历史隔离结果及当前静态分析。本包未重跑 restore、未使用测试/临时 DB，也未新增 schema 注册表的完整性核对；不宣称恢复/计数验收通过。
- **D02/D03**：继承当前静态裁定。`deploy.sh:94-152` 展示 preflight、候选安装/迁移/构建与切流顺序；失败 smoke 的脚本提示按 §13 回滚，但仓库内未定位到该 §13 runbook 文件。真实 systemd `EnvironmentFile`、CORS headers、候选构建和手动 rollback 均未在目标环境观察。
- `docs/deployment/deploy-guide.md` 含旧部署/备份示例，但不是与当前 `/opt/rdpms` 发布脚本绑定的 §13 操作 runbook；不能作为目标环境实际回滚证据。

## 环境要求与证据矩阵

所需目标环境、前置材料、执行边界和解除条件见 `environment-requirements.md`；分情景的成功/失败判定见 `recovery-state-matrix.md`。当前所有环境项目均未执行：Linux D01 两轮快照、隔离 DB+uploads 配对恢复、候选门禁故障注入、配置消费对照、真实手动回滚。

## 发现及建议

没有增加或撤销 finding。延续既有建议：先在目标 Linux 临时文件系统做两轮不可变快照验证；备份增加 DB/file runId、共同时点或写屏障以及内容清单；restore 逐表对真实受影响行计数；候选 preflight 绑定候选 build identity；统一应用与部署配置 schema；将非敏感、可操作的回滚步骤、决策权、迁移兼容边界和验收记录补入受控运维 runbook。实施和生产演练属于后续授权工作。
