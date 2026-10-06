# 窗口 F 交接（handoff）

窗口：F（cache / 水位 / 撤权 / 最后副本保全）
批次：`parallel-lr7-2026-10-04-p01`
模式：`PROPOSED_APPROVAL_PREPARATION_ONLY`

## 交付范围

仅材料，待批准。面向 `T-RP-04`（提交可见水位与 bootstrap）与 `T-RP-12`（用户可恢复流程与保留）。

## 给 integrator 的要点

1. 本窗口全部文件位于 `execution/supplements/parallel-lr7-2026-10-04-p01/window-f-cache/`，未触碰任何根台账或其他窗口。
2. `T-RP-04`、`T-RP-12` 在 `DECISION_REGISTER.json` 仍为 `PROPOSED`，`approvedBy/approvedAt/evidenceRef=null`；本窗口未改变该状态，亦未代 integrator 写根记录。
3. 复用的 barrier 证据来自 `RP13-T02`（`WATERMARK_ADR_DRAFT.md`、`barrier-summary.json`），属 `REUSED_VERIFIED_EVIDENCE`，未重跑。
4. 局部 barrier / `seq` 递增**未**被当作生产 `safe-watermark` 验收；真实 DB/IDB/多 tab/非空撤权验收见 `acceptance-draft.csv`，状态 `NOT_RUN`。
5. `RP13-T03` 不得因本材料激活；`T-RP-10`（restore epoch）仍 `PROPOSED`。

## 门禁影响

- `RP08-T02` 的 `gateRequirements` 含 `T-RP-04`/`T-RP-12`（`before: IMPLEMENTATION, condition: always`）。这两道门仍 `PROPOSED`，故 `RP08-T02` 实现门未过。
- `INT-PC05-01`、`INT-PC12-01`、`GATE-S03-OI-01` 均 `NOT_RUN`。

## 待汇总（不阻塞本窗口）

跨包裁定缺项（待 integrator 汇总 A–F）：与 C 的 receipt/保留窗、D 的 generation、E 的客户端兼容——见 `interface-notes.md`。本窗口未等待或修改其他窗口。
