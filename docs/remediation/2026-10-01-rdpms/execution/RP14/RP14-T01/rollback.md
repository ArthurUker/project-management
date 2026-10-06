# RP14-T01 回退说明

本地候选回退可撤销本任务的 `files.js`、`regulatory-documents.js` 两处调用、新建 `src/modules/files/fileReadService.ts` 与本任务集成测试。当前共享工作区包含其他已授权任务未提交改动，不能对整个文件执行版本回退；如需回退，只能按 `evidence/source-diff.patch` 逐项反向应用并核对工作区。

没有数据库迁移或持久业务数据写入。本任务候选版本尚未构建/运行，生产回退与目标环境兼容演练 `NOT_RUN`；不能据此假设部署回退安全。回退不得移除感染文件拒绝逻辑。
