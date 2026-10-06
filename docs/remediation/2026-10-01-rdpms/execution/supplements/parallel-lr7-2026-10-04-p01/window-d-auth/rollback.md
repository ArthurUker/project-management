# rollback.md — 回退方案

窗口 D 为只读准备 + 仅写 `window-d-auth/` 新文件，未修改任何业务源码、共享台账或其他窗口。回退即删除本分区全部新增文件，无业务副作用。

## 回退步骤
1. 删除分区目录：
   `docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-d-auth/`
2. 该目录外无任何本窗口写入；无需 revert 业务代码、schema、配置或共享 ledger。
3. 不在 git 中 stage/commit；如已被误 stage，执行 `git restore --staged <path>`（仅限本分区路径）。

## 影响评估
- 业务运行时：无影响（未改动 `rdpms-system/` 任何文件）。
- 共享台账：无影响（TASK_GRAPH/PACKAGES/DECISIONS/ACCEPTANCE/history 均未写）。
- 其他并行窗口 A–F：无影响（各自独立分区）。
- 已冻结的 RP00-T04 矩阵与 LR6 复核：未被改动。

## 不触发回退的情况
本窗口未启动任何真实构建/数据库/部署，无运行态资源（临时根、守护进程、端口）需清理。
