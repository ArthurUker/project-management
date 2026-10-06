# 回滚说明 — seal-correction-2026-10-05-01（有界封存订正）

本订正的写入均为**新增 K 目录**与两 history 各一个唯一订正条目的**追加**；未修改任何受保护文件、worker 文件、旧 J 交付、两 state、两 handoff、计划/决定/任务图/验收/发现/记忆。

## 允许的唯一撤回方式（追加式）
1. **新增 K 目录**：`execution/supplements/parallel-lr7-2026-10-04-p01/integration/seal-correction-2026-10-05-01/` 全部产物，可经追加撤回/替代记录说明作废，保留原字节。
2. **两 history 订正条目**（version `parallel-lr7-2026-10-05-seal-correction-01`、id `EXEC-parallel-lr7-2026-10-05-seal-correction-01`）可经追加一条更新的订正/替代条目指向撤回，保留原条目字节。

## 禁止事项（与本订正边界一致）
- **禁止删除**已进入汇总证据的封存目录（旧 J `readiness-resume-01/`、本 K `seal-correction-2026-10-05-01/`）；已引用的封存目录只能追加撤回/替代记录。
- **禁止移除**任一 history registry 的既有条目（含旧 integration 条目与本订正条目）。
- **禁止回滚**任何业务数据、worker 交付或业务源码；本订正不改这些内容。

> 旧 J 的 `rollback.md` 曾包含“删除 J 目录 / 移除六根记录新条目”的表述（已被 AG-06 判定与追加式保留冲突，且未执行）。本文件明确替代其为追加式撤回，旧件字节保留。
