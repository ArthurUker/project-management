# interface-notes.md — T-RP-09 跨窗口接口点（待集成汇总）

窗口 D 仅登记接口点；详细合同归属对应窗口，不在本窗口定稿。所有项 `PROPOSED` / 待汇总。

## 1. 与窗口 C（actor / key，决策 T-RP-02）
- **接口点**：PC01 要求“刷新请求、成功/失败响应、原始待重放请求都绑定发起时 actor/session generation”。该 actor 标识与 T-RP-02 的 `actor/resource/command/key/hash` 回执/保留窗需要一致命名。
- **待确认**：session generation 的字段名、版本语义、以及它如何映射到 C 的 command key/hash 回执。C 的 PC03 同事务回执与 unknown/expired 恢复也影响 refresh 失败时的回执口径。
- **状态**：待 C 窗口交付后对齐；本窗口不代签。

## 2. 与窗口 E（兼容窗口，决策 T-RP-03）
- **接口点**：T-RP-09 的“受支持 transport / 客户端 / 兼容窗口”须与 T-RP-03 客户端 revision 兼容矩阵（支持版本、missing base/409 提示、升级截止）保持一致。
- **待确认**：哪些前端 revision 仍使用 Bearer/body 传输；旧 revision 在 generation fence 引入后是否需要兼容期或强制升级截止。
- **状态**：待 E 窗口交付后对齐。

## 3. 与窗口 F（缓存 generation 接口，决策 T-RP-12 / 缓存保全）
- **接口点**：PC01 的“权限拒绝不能通过旧缓存回退绕过当前授权”与 F 的缓存 generation/保全接口相交。前端 generation fence（OBS-05 fail-closed）需与缓存 generation key 协调，避免重放请求命中过期缓存。
- **待确认**：session generation 与缓存 generation 是否共用同一代际计数器；缓存失效事件如何与 refresh/代际变更联动。
- **状态**：待 F 窗口交付后对齐。

## 4. 与 PC04 / RP11-T01（多 tab IDB 升级、owner 命名空间）
- **接口点**：跨 tab refresh 协调（OBS-02）与 PC04 的多 tab IDB sender lease/协调在“跨 tab”维度相交。generation fence 的跨 tab 可见性依赖 PC04 的 owner/generation 校验。
- **状态**：本窗口仅 flag 接口点（见 `generation-matrix.csv` 的 `PC04-NOTE` 行）；详细 IDB 合同归 PC04/T-RP-12。

## 5. 汇总阻塞
- 上述三项均未在本窗口定稿；集成阶段（INTEGRATOR）须收集 C/E/F 交付并以一致字段名对齐 actor / session generation / 缓存 generation。
- D-S01-04 的 access JWT 失效时限若获批，会影响本窗口“维持 access TTL 默认 900s”的兼容表述，需回写。
