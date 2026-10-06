# 跨包接口冲突 — C～F 汇总（仅记录，不裁定生产政策）

> 本文件列出窗口 C/D/E/F 之间待裁定/未对齐的接口点，附来源与各窗口 interface-notes 引用。本汇总**不代签、不选生产政策、不修改各窗口文档**。所有冲突待具名负责人与批准动作按 `CROSS_PACKAGE_CONTRACTS` / `DECISION_REGISTER` 裁定。

## 1. actor / key / 回执作用域（C T-RP-02 ↔ D T-RP-09）
- **点**：C 的 `actor/resource/command/key/hash` 回执/保留窗 与 D 的 session generation 字段命名/版本语义须一致；PC03 同事务回执与 unknown/expired 恢复影响 refresh 失败时的回执口径。
- **未决**：session generation 字段名、版本语义、如何映射到 C 的 command key/hash 回执；401 vs 409/404 语义划分（C 主张同 key 异 payload→409，跨 actor/未授权→unknown/404，不返回 401）。
- **来源**：C `interface-notes.md` §1；D `interface-notes.md` §1。
- **责任**：认证负责人（D）+ 回执负责人（C）。

## 2. 保留窗 vs 缓存 TTL（C T-RP-02 ↔ F T-RP-12）
- **点**：C 回执 `expiresAt` 默认 24h（对齐 `RECEIPT_TTL_MS`）需与 F 的 dead-letter 保留期/缓存 TTL 对齐，避免“回执未过期但缓存已失效或反之”导致重放/查无不一致。
- **未决**：receipt 保留期与 dead-letter 保留期是否同源、跨 owner 隔离是否一致；最大离线窗是否以 F 水位为下界。
- **来源**：C `interface-notes.md` §2；F `interface-notes.md` §C。
- **责任**：产品/数据负责人（C、F）。

## 3. 缓存 generation ↔ session generation（D T-RP-09 ↔ F T-RP-04/T-RP-12）
- **点**：D 前端 generation fence（OBS-05 fail-closed）需与 F 缓存 generation key 协调，避免重放请求命中过期缓存；PC01“权限拒绝不能经旧缓存回退绕过当前授权”与 F 缓存生成/保全相交。
- **未决**：session generation 与缓存 generation 是否共用同一代际计数器；缓存失效事件如何与 refresh/代际变更联动。
- **来源**：D `interface-notes.md` §3；F `interface-notes.md` §D。
- **责任**：认证负责人（D）+ 架构负责人（F）。

## 4. 兼容窗口（E T-RP-03 ↔ D T-RP-09 ↔ F T-RP-04）
- **点**：E 客户端 revision 兼容矩阵（支持版本、missing base/409 提示、升级截止）须与 D 受支持 transport/客户端/兼容窗口、F 最低客户端版本（epoch+keyset pagination）一致。
- **未决**：哪些前端 revision 仍用 Bearer/body；旧 revision 在 generation fence 引入后是否需要兼容期或强制升级截止；F `RESET_REQUIRED` 阈值由 E 给定最低版本。
- **来源**：D `interface-notes.md` §2；E `decision-draft.md` P4；F `interface-notes.md` §E。
- **责任**：前端负责人（E）+ 认证负责人（D）+ 架构负责人（F）。

## 5. 页令牌 actorId / 密钥 对齐（D ↔ F）
- **点**：F 游标绑定 `actorId`+`deviceId`（`sync.js` L323–L347）；若 D 改变 token generation/refresh 或引入 cookie transport，`SYNC_PAGE_TOKEN_SECRET`（`sync.js` L315）与 `actorId` 解析需随之对齐。
- **未决**：D 的 transport 决策是否影响 sync 页令牌的 `actorId` 来源与密钥轮换。
- **来源**：F `interface-notes.md` §D。
- **责任**：认证负责人（D）+ 架构负责人（F）。

## 6. 多 tab IDB owner / generation（D PC04 ↔ F T-RP-12）
- **点**：跨 tab refresh 协调（OBS-02）与 PC04 多 tab IDB sender lease/协调在“跨 tab”维度相交；generation fence 跨 tab 可见性依赖 PC04 owner/generation 校验。
- **来源**：D `interface-notes.md` §4。
- **责任**：前端负责人（D、F/T-RP-12）。

## 7. 恢复 epoch 耦合（T-RP-10 ↔ T-RP-04）
- **点**：T-RP-10（restore epoch 与 stale cursor/session/outbox）仍 PROPOSED，与 T-RP-04 的 epoch/reset 耦合；阶段软删/删除政策未因本材料获准；RP13-T03 不得激活。
- **来源**：F `approval-request.md`、`interface-notes.md`。
- **责任**：架构负责人。

## 8. access JWT 撤销（D-S01-04，独立）
- **点**：D-S01-04 改密/重置/降权后 access JWT 失效策略仍 `PENDING`，由 RP03-T02 + 联合合同 PC01 单独批准；T-RP-09 推荐合同不代选，其若获批会影响 D “维持 access TTL 默认 900s”的兼容表述。
- **来源**：D `approval-request.md` §B；D `interface-notes.md` §5。
- **责任**：安全/认证负责人。

## 汇总阻塞结论
- 上述 1–8 项**均无**跨包最终裁定；状态为待 integrator/批准动作对齐。本汇总仅记录来源与责任角色，不改变任何窗口文档或根台账，不代签生产政策。
- 原 31 开放项保持 OPEN；其中 S03-OI-09（E）、S03-OI-01（F/T-RP-04 barrier）、S03-OI-04（C 清理 job）直接阻塞对应业务验收，仍未解决。
