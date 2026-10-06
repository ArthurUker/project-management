# 有界封存订正交接 — parallel-lr7-2026-10-05-seal-correction-01

## 本订正已完成（仅元数据层）
- 响应独立复核 `MATERIAL_PRESERVED_FINAL_SEAL_REQUIRES_CORRECTION`，对 `readiness-resume-01` 汇总的**交付元数据**做有限订正；材料、worker 输入与六根记录追加均保留。
- 已落地 K 目录 `execution/supplements/parallel-lr7-2026-10-04-p01/integration/seal-correction-2026-10-05-01/`：AG-01 引用合同订正、AG-02 六窗口审批字段规范化、AG-03 正确 EXEC history id、AG-04 去重与准确计数、AG-05 T-RP-02 批准前澄清、AG-06 追加式回滚边界，及七类交付与统一封存。
- 两 state / 两 handoff 保持当前字节；仅在 REVISION_HISTORY / EXECUTION_REVISION_HISTORY 各追加一个唯一订正条目。

## 关键证据限制（务必向下游传达）
- AG-01：8 个错误 base 引用已映射为 REPOSITORY 完整路径；34 个缺 base 九路径引用已出规范化副本；E 外部请求真实路径为 `window-e-revision/evidence/external-client-evidence-request.md`。
- AG-02：六个就绪节点补齐 pendingApprovals（A 取自有效新 READY，B～F 取自原 notApproved 并保留来源）；未新增任何批准值，未把缺项标为“无待批”。
- AG-03：新 EXEC 条目使用真实 `id`（不再以 version 代替）；correctsRef 精确指向 entries[17]。
- AG-05：T-RP-02 “任意 500 整体回滚”表述与 RP00-T02/FP-06/07/08 冲突，仅记录待负责人澄清，未修改 C 方案、未选择政策、未批准。
- 产品动态验收 `NOT_RUN`；完整运行器独立动态验收 `NOT_EVALUATED`；`release=NOT_EVALUATED`。

## 待独立复核 / 待批准（未代签）
- 本订正 `independentReview=PENDING`、`release=NOT_EVALUATED`。
- C（T-RP-02）、D（T-RP-09）、E（T-RP-03）、F（T-RP-04/T-RP-12）仍为 PROPOSED，批准人/日期/证据均 null；负责人可同时阅读 `BUSINESS_DECISIONS.md` 审查，不因元数据补正自动批准。
- 原 54/306 轴、包状态、31 开放项、门禁与业务批准均不变；原 36 项实施任务未完成。

## 入口
- K 目录：`execution/supplements/parallel-lr7-2026-10-04-p01/integration/seal-correction-2026-10-05-01/`
- 复核：`docs/remediation/2026-10-05-parallel-aggregation-review/{REVIEW.md,findings.json,evidence/readback.json,BUSINESS_DECISIONS.md}`
- 旧汇总：`execution/supplements/parallel-lr7-2026-10-04-p01/integration/readiness-resume-01/`
