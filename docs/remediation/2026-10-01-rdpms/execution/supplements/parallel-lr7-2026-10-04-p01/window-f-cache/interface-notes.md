# 接口备注（窗口 F）：跨窗口协调点

本窗口仅准备材料；下列跨包/跨窗口裁定**缺项待 integrator 汇总**，本窗口不等待、不修改其他窗口。

## 与窗口 C（receipt / 保留窗）

- C 负责 `T-RP-02` 回执/保留窗。F 的 `T-RP-12` 需要「保留前最后副本不丢」与 C 的 receipt 保留窗对齐：
  - 当前 `engine.ts` dead-letter 在登出/账号切换时保全（L525–L551、L558–L575）；C 的 receipt 语义若定义更短保留，需在集成时仲裁。
  - 待汇总：receipt 保留期与 dead-letter 保留期是否同源、跨 owner 隔离是否一致。

## 与窗口 D（generation）

- D 负责 `T-RP-09` 认证 transport 与 generation。F 的 `T-RP-04` 游标绑定 `actorId`+`deviceId`（`sync.js` L323–L347）；若 D 改变 token generation/refresh 或引入 cookie transport，页令牌签名密钥 `SYNC_PAGE_TOKEN_SECRET`（L315）与 `actorId` 解析需随之对齐。
  - 待汇总：D 的 transport 决策是否影响 sync 页令牌的 `actorId` 来源与密钥轮换。

## 与窗口 E（客户端兼容）

- E 负责 `T-RP-03` 源客户端矩阵与策略。F 的 `T-RP-04` 要求 `epoch`/`scope-version` 绑定（`SyncInitResponse` 当前无 `epoch`，`sync.ts` L48–L56）；E 的客户端版本矩阵决定哪些版本须升级以支持 keyset pagination + epoch。
  - 待汇总：兼容窗（最低客户端版本）由 E 给定，F 据此设 `RESET_REQUIRED` 阈值。

## 缺跨包裁定（列待 integrator 汇总）

| 项 | 涉及窗口 | 状态 |
|----|----------|------|
| receipt 保留期 vs dead-letter 保留期 | C / F | 待汇总 |
| 页令牌密钥/actorId 与 token generation 对齐 | D / F | 待汇总 |
| 最低客户端版本（epoch+pagination）兼容窗 | E / F | 待汇总 |
| PC05（水位/修订/回填/游标过期）与 PC12（冲突/最后副本）联合验收 | F + 相关 | 待 integrator 写入根台账 |

## 不变约束

- 本窗口不改共享台账/其他窗口；上述仅为待汇总接口点，供 integrator 聚合时参考。
- `RP13-T03` 不激活；`T-RP-10` 仍 `PROPOSED`。
