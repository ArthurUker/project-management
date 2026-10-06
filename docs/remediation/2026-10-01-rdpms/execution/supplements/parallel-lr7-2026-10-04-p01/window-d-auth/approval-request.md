# approval-request.md — T-RP-09 待批准事项

本文件列出需**具名安全/认证/前端负责人**确认的精确选择。窗口 D 仅准备材料，不代签。所有项保持 `PROPOSED`，签名 `null`。

## A. 须具名确认的选择（精确）

1. **跨 tab 协调与回退**（PC01 服务端 CAS/family 重放 + 客户端并发/重试窗口）
   候选：(a) 严格单次消费，二次轮换 family 以专属码拒绝；(b) 宽松 family 重放，交错 successor 短暂都接受。
   需确认人：**安全负责人 + 认证负责人 + 前端负责人**。

2. **Refresh 单次消费 / family 重放 / 盗用响应 / 轮换重试与幂等窗口 / 失败恢复语义**
   待填：rotation retry 窗口长度、idempotency 边界、失败清理的 lineage 归属判定口径。
   需确认人：**安全负责人 + 认证负责人**。

3. **前端 generation fence 存储形态与 fail-closed 触发**
   待填：按请求内存 config 还是持久化 session generation；代际偏离时中止重放的精确触发点（OBS-05）。
   需确认人：**前端负责人**。

4. **受支持 transport / 客户端 / 兼容窗口 / 残余风险 / 批准日期与证据**
   须明确登记：cookie 仍“不支持”（不得由 CORS 旗标推定）；Bearer/body 为唯一传输；兼容窗口与降级策略。
   需确认人：**审批人（具名）**。

## B. 独立门禁（不因本窗口隐式批准）

- **D-S01-04**（改密/重置/降权后 access JWT 失效）：仍为 `PENDING`，由 `RP03-T02` + 联合合同 PC01 单独批准。T-RP-09 推荐合同不代选。
- **T-RP-09 / PC01 / PC04 / PC09**：本窗口只交付推荐材料，批准记录保持空。
- **T-RP-12**（用户可恢复流程与保留）：缓存/保全策略不代签。

## C. 当前未定、待汇总部分（跨窗口）

见 `interface-notes.md`：与窗口 C（actor/key）、E（兼容窗口）、F（缓存 generation 接口）的接口点尚未汇总，需集成阶段对齐。

## D. 批准记录字段（待填，当前空）

`approvedBy`、`approvedAt`、`evidenceRef`、`compatibilityWindow`、`residualRisks` 全部 `null`/空。
